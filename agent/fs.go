package main

import (
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

var (
	errForbidden = errors.New("forbidden path")
	errReadOnly  = errors.New("only markdown files and .smartmark/ can be written")
)

// skipDirs are never walked or served: they are large and never workspace content.
var skipDirs = map[string]bool{"node_modules": true, ".git": true}

// maxFiles bounds a listing so a huge tree cannot exhaust memory.
const maxFiles = 50000

// Workspace is a root directory exposed to the client. All access goes through
// resolve(), which keeps every path inside the root, including through symlinks.
type Workspace struct {
	root string // absolute, symlink-resolved
}

func NewWorkspace(root string) (*Workspace, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return nil, err
	}
	st, err := os.Stat(real)
	if err != nil {
		return nil, err
	}
	if !st.IsDir() {
		return nil, fmt.Errorf("%s is not a directory", root)
	}
	return &Workspace{root: real}, nil
}

func isMarkdown(p string) bool {
	l := strings.ToLower(p)
	return strings.HasSuffix(l, ".md") || strings.HasSuffix(l, ".markdown")
}

// validRel checks a client-supplied relative posix path lexically.
func validRel(rel string) error {
	if rel == "" || strings.ContainsRune(rel, 0) || strings.Contains(rel, "\\") || strings.HasPrefix(rel, "/") {
		return errForbidden
	}
	for _, seg := range strings.Split(rel, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return errForbidden
		}
		// Dot-entries are private, except the workspace config folder.
		if strings.HasPrefix(seg, ".") && seg != ".smartmark" {
			return errForbidden
		}
		if skipDirs[seg] {
			return errForbidden
		}
	}
	return nil
}

// resolve maps a relative path to an absolute one that is guaranteed to be
// inside the root after symlink resolution. For not-yet-existing files the
// deepest existing parent is checked.
func (w *Workspace) resolve(rel string) (string, error) {
	if err := validRel(rel); err != nil {
		return "", err
	}
	full := filepath.Join(w.root, filepath.FromSlash(rel))
	probe := full
	for {
		real, err := filepath.EvalSymlinks(probe)
		if err == nil {
			if real != w.root && !strings.HasPrefix(real, w.root+string(filepath.Separator)) {
				return "", errForbidden
			}
			return full, nil
		}
		if !errors.Is(err, fs.ErrNotExist) {
			return "", err
		}
		parent := filepath.Dir(probe)
		if parent == probe {
			return "", errForbidden
		}
		probe = parent
	}
}

func canWrite(rel string) bool {
	return isMarkdown(rel) || strings.HasPrefix(rel, ".smartmark/")
}

// List returns every visible file as a sorted relative posix path.
func (w *Workspace) List() ([]string, error) {
	var out []string
	err := filepath.WalkDir(w.root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // unreadable entries are skipped, not fatal
		}
		if p == w.root {
			return nil
		}
		name := d.Name()
		if d.IsDir() {
			if skipDirs[name] || (strings.HasPrefix(name, ".") && name != ".smartmark") {
				return fs.SkipDir
			}
			return nil
		}
		if strings.HasPrefix(name, ".") && !strings.HasPrefix(p, filepath.Join(w.root, ".smartmark")+string(filepath.Separator)) {
			return nil
		}
		if !d.Type().IsRegular() { // symlinks and specials are not listed
			return nil
		}
		rel, err := filepath.Rel(w.root, p)
		if err != nil {
			return nil
		}
		out = append(out, filepath.ToSlash(rel))
		if len(out) >= maxFiles {
			return fs.SkipAll
		}
		return nil
	})
	sort.Strings(out)
	return out, err
}

// ETag identifies a file version by size and mtime.
func etagOf(st os.FileInfo) string {
	h := sha1.Sum([]byte(fmt.Sprintf("%d:%d", st.Size(), st.ModTime().UnixNano())))
	return `"` + hex.EncodeToString(h[:8]) + `"`
}
