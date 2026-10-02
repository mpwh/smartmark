package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const tok = "0123456789abcdef0123"

func setup(t *testing.T) (*httptest.Server, string, string) {
	t.Helper()
	base := t.TempDir()
	root := filepath.Join(base, "ws")
	outside := filepath.Join(base, "secret.txt")
	must(t, os.MkdirAll(filepath.Join(root, "notes"), 0o755))
	must(t, os.MkdirAll(filepath.Join(root, ".git"), 0o755))
	must(t, os.MkdirAll(filepath.Join(root, "node_modules/x"), 0o755))
	must(t, os.WriteFile(filepath.Join(root, "a.md"), []byte("# a"), 0o644))
	must(t, os.WriteFile(filepath.Join(root, "notes/b.md"), []byte("b"), 0o644))
	must(t, os.WriteFile(filepath.Join(root, "pic.png"), []byte("png"), 0o644))
	must(t, os.WriteFile(filepath.Join(root, ".git/config"), []byte("x"), 0o644))
	must(t, os.WriteFile(filepath.Join(root, "node_modules/x/i.md"), []byte("x"), 0o644))
	must(t, os.WriteFile(outside, []byte("TOP SECRET"), 0o644))
	must(t, os.Symlink(outside, filepath.Join(root, "leak.md")))
	must(t, os.Symlink(base, filepath.Join(root, "escape")))
	ws, err := NewWorkspace(root)
	must(t, err)
	s := &Server{ws: ws, token: tok, origins: map[string]bool{"http://app.test": true}, watch: NewWatcher(ws, 50*time.Millisecond), version: "t"}
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(ts.Close)
	return ts, root, outside
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func do(t *testing.T, method, url, body string, hdr map[string]string) (*http.Response, string) {
	t.Helper()
	req, _ := http.NewRequest(method, url, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tok)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	must(t, err)
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res, string(b)
}

func TestAuthRequired(t *testing.T) {
	ts, _, _ := setup(t)
	for _, h := range []string{"", "Bearer wrong"} {
		req, _ := http.NewRequest("GET", ts.URL+"/v1/files", nil)
		if h != "" {
			req.Header.Set("Authorization", h)
		}
		res, _ := http.DefaultClient.Do(req)
		if res.StatusCode != 401 {
			t.Fatalf("auth %q: got %d", h, res.StatusCode)
		}
	}
}

func TestListHidesPrivate(t *testing.T) {
	ts, _, _ := setup(t)
	_, body := do(t, "GET", ts.URL+"/v1/files", "", nil)
	for _, bad := range []string{".git", "node_modules", "leak.md", "escape"} {
		if strings.Contains(body, bad) {
			t.Fatalf("listing leaks %s: %s", bad, body)
		}
	}
	for _, want := range []string{"a.md", "notes/b.md", "pic.png"} {
		if !strings.Contains(body, want) {
			t.Fatalf("missing %s: %s", want, body)
		}
	}
}

func TestPathTraversalAndSymlinks(t *testing.T) {
	ts, _, _ := setup(t)
	for _, p := range []string{"../secret.txt", "..%2Fsecret.txt", "/etc/passwd", "notes/../../secret.txt", ".git/config", "leak.md", "escape/secret.txt", "node_modules/x/i.md", "a%00.md"} {
		res, body := do(t, "GET", ts.URL+"/v1/file?path="+p, "", nil)
		if res.StatusCode == 200 || strings.Contains(body, "TOP SECRET") {
			t.Fatalf("path %q readable: %d %s", p, res.StatusCode, body)
		}
		res, _ = do(t, "PUT", ts.URL+"/v1/file?path="+p, "pwn", nil)
		if res.StatusCode == 204 {
			t.Fatalf("path %q writable", p)
		}
	}
}

func TestReadWriteAndRestrictions(t *testing.T) {
	ts, root, _ := setup(t)
	res, body := do(t, "GET", ts.URL+"/v1/file?path=a.md", "", nil)
	if res.StatusCode != 200 || body != "# a" || res.Header.Get("ETag") == "" {
		t.Fatalf("read: %d %q", res.StatusCode, body)
	}
	if res, _ := do(t, "PUT", ts.URL+"/v1/file?path=new/dir/c.md", "hi", nil); res.StatusCode != 204 {
		t.Fatalf("create: %d", res.StatusCode)
	}
	if b, _ := os.ReadFile(filepath.Join(root, "new/dir/c.md")); string(b) != "hi" {
		t.Fatalf("content %q", b)
	}
	if res, _ := do(t, "PUT", ts.URL+"/v1/file?path=pic.png", "x", nil); res.StatusCode != 403 {
		t.Fatalf("non-markdown write allowed: %d", res.StatusCode)
	}
	if res, _ := do(t, "PUT", ts.URL+"/v1/file?path=.smartmark/theme.css", "x", nil); res.StatusCode != 204 {
		t.Fatalf(".smartmark write: %d", res.StatusCode)
	}
}

func TestIfMatchConflict(t *testing.T) {
	ts, root, _ := setup(t)
	res, _ := do(t, "GET", ts.URL+"/v1/file?path=a.md", "", nil)
	etag := res.Header.Get("ETag")
	// External edit changes the file under the client.
	must(t, os.WriteFile(filepath.Join(root, "a.md"), []byte("changed elsewhere, longer"), 0o644))
	if res, _ := do(t, "PUT", ts.URL+"/v1/file?path=a.md", "mine", map[string]string{"If-Match": etag}); res.StatusCode != 412 {
		t.Fatalf("expected 412, got %d", res.StatusCode)
	}
	res, _ = do(t, "GET", ts.URL+"/v1/file?path=a.md", "", nil)
	if res, _ := do(t, "PUT", ts.URL+"/v1/file?path=a.md", "mine", map[string]string{"If-Match": res.Header.Get("ETag")}); res.StatusCode != 204 {
		t.Fatalf("expected 204, got %d", res.StatusCode)
	}
}

func TestCORS(t *testing.T) {
	ts, _, _ := setup(t)
	req, _ := http.NewRequest("OPTIONS", ts.URL+"/v1/files", nil)
	req.Header.Set("Origin", "http://app.test")
	res, _ := http.DefaultClient.Do(req)
	if res.StatusCode != 204 || res.Header.Get("Access-Control-Allow-Origin") != "http://app.test" {
		t.Fatalf("allowed origin: %d %v", res.StatusCode, res.Header)
	}
	req.Header.Set("Origin", "http://evil.test")
	res, _ = http.DefaultClient.Do(req)
	if res.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("evil origin allowed")
	}
}

func TestEventsOnChange(t *testing.T) {
	ts, root, _ := setup(t)
	req, _ := http.NewRequest("GET", ts.URL+"/v1/events?token="+tok, nil)
	res, err := http.DefaultClient.Do(req)
	must(t, err)
	defer res.Body.Close()
	time.Sleep(150 * time.Millisecond)
	must(t, os.WriteFile(filepath.Join(root, "notes/b.md"), []byte("edited externally"), 0o644))
	done := make(chan string, 1)
	go func() {
		buf := make([]byte, 512)
		var got string
		for !strings.Contains(got, "notes/b.md") {
			n, err := res.Body.Read(buf)
			got += string(buf[:n])
			if err != nil {
				break
			}
		}
		done <- got
	}()
	select {
	case got := <-done:
		if !strings.Contains(got, "event: change") {
			t.Fatalf("bad event: %q", got)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("no change event")
	}
}
