package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxWriteBytes = 8 << 20 // 8 MiB

type Server struct {
	ws      *Workspace
	token   string
	origins map[string]bool
	watch   *Watcher
	version string
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/info", s.info)
	mux.HandleFunc("GET /v1/files", s.list)
	mux.HandleFunc("GET /v1/file", s.read)
	mux.HandleFunc("PUT /v1/file", s.write)
	mux.HandleFunc("GET /v1/events", s.events)
	return s.cors(s.auth(mux))
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && s.origins[origin] {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Vary", "Origin")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match")
			h.Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
			h.Set("Access-Control-Expose-Headers", "ETag")
			// Lets an https page reach a localhost/private-network agent.
			h.Set("Access-Control-Allow-Private-Network", "true")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		// EventSource cannot set headers, so /v1/events also accepts ?token=.
		if got == "" && r.URL.Path == "/v1/events" {
			got = r.URL.Query().Get("token")
		}
		if subtle.ConstantTimeCompare([]byte(got), []byte(s.token)) != 1 {
			jsonErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func jsonErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (s *Server) info(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"name": filepath.Base(s.ws.root), "version": s.version,
	})
}

func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	files, err := s.ws.List()
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if files == nil {
		files = []string{}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string][]string{"files": files})
}

func (s *Server) read(w http.ResponseWriter, r *http.Request) {
	full, err := s.ws.resolve(r.URL.Query().Get("path"))
	if err != nil {
		jsonErr(w, http.StatusForbidden, err.Error())
		return
	}
	f, err := os.Open(full)
	if err != nil {
		code := http.StatusInternalServerError
		if errors.Is(err, fs.ErrNotExist) {
			code = http.StatusNotFound
		}
		jsonErr(w, code, "cannot open file")
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || !st.Mode().IsRegular() {
		jsonErr(w, http.StatusNotFound, "not a file")
		return
	}
	w.Header().Set("ETag", etagOf(st))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// Serve as an opaque download type except for images; markdown is text.
	w.Header().Set("Content-Type", contentType(full))
	http.ServeContent(w, r, "", st.ModTime(), f)
}

func contentType(p string) string {
	switch strings.ToLower(filepath.Ext(p)) {
	case ".md", ".markdown", ".txt":
		return "text/plain; charset=utf-8"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		// SVG can carry script; force it to be inert.
		return "application/octet-stream"
	}
	return "application/octet-stream"
}

func (s *Server) write(w http.ResponseWriter, r *http.Request) {
	rel := r.URL.Query().Get("path")
	full, err := s.ws.resolve(rel)
	if err != nil {
		jsonErr(w, http.StatusForbidden, err.Error())
		return
	}
	if !canWrite(rel) {
		jsonErr(w, http.StatusForbidden, errReadOnly.Error())
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxWriteBytes))
	if err != nil {
		jsonErr(w, http.StatusRequestEntityTooLarge, "body too large")
		return
	}
	// Optimistic concurrency: If-Match must equal the current ETag when the file exists.
	if im := r.Header.Get("If-Match"); im != "" {
		if st, err := os.Stat(full); err == nil && etagOf(st) != im {
			jsonErr(w, http.StatusPreconditionFailed, "file changed on disk")
			return
		}
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		jsonErr(w, http.StatusInternalServerError, "mkdir failed")
		return
	}
	// Re-check containment now that parent dirs exist (guards symlink races on new dirs).
	if _, err := s.ws.resolve(rel); err != nil {
		jsonErr(w, http.StatusForbidden, err.Error())
		return
	}
	mode := os.FileMode(0o644)
	if st, err := os.Stat(full); err == nil {
		mode = st.Mode().Perm()
	}
	if err := atomicWrite(full, body, mode); err != nil {
		jsonErr(w, http.StatusInternalServerError, "write failed")
		return
	}
	st, err := os.Stat(full)
	if err == nil {
		w.Header().Set("ETag", etagOf(st))
	}
	s.watch.Poke()
	w.WriteHeader(http.StatusNoContent)
}

func atomicWrite(path string, data []byte, mode os.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".smartmark-tmp-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(mode); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(name, path)
}

// events streams a "change" event whenever the file listing or any mtime changes.
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		jsonErr(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	ch, cancel := s.watch.Subscribe()
	defer cancel()
	fmt.Fprint(w, ": connected\n\n")
	fl.Flush()
	keep := time.NewTicker(25 * time.Second)
	defer keep.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case paths := <-ch:
			b, _ := json.Marshal(paths)
			fmt.Fprintf(w, "event: change\ndata: %s\n\n", b)
			fl.Flush()
		case <-keep.C:
			fmt.Fprint(w, ": ping\n\n")
			fl.Flush()
		}
	}
}
