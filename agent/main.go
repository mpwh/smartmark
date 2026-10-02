// smartmark-agent exposes one folder over a small authenticated HTTP API so the
// Smartmark web app can browse and edit markdown files in it.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

var version = "dev"

type listFlag []string

func (l *listFlag) String() string     { return strings.Join(*l, ",") }
func (l *listFlag) Set(v string) error { *l = append(*l, v); return nil }

func main() {
	var origins listFlag
	root := flag.String("root", ".", "folder to serve")
	addr := flag.String("addr", "127.0.0.1:7777", "listen address (use a TLS proxy or --tls-* for non-local access)")
	token := flag.String("token", os.Getenv("SMARTMARK_TOKEN"), "access token (default: random per start)")
	app := flag.String("app", "http://localhost:5173", "web app URL, used for the connect link and as an allowed origin")
	certFile := flag.String("tls-cert", "", "TLS certificate file")
	keyFile := flag.String("tls-key", "", "TLS key file")
	flag.Var(&origins, "origin", "additional allowed web origin (repeatable)")
	flag.Parse()

	ws, err := NewWorkspace(*root)
	if err != nil {
		log.Fatalf("root: %v", err)
	}
	if *token == "" {
		b := make([]byte, 24)
		if _, err := rand.Read(b); err != nil {
			log.Fatal(err)
		}
		*token = hex.EncodeToString(b)
	}
	if len(*token) < 16 {
		log.Fatal("token must be at least 16 characters")
	}
	appURL, err := url.Parse(*app)
	if err != nil || appURL.Scheme == "" {
		log.Fatalf("invalid --app %q", *app)
	}
	allowed := map[string]bool{appURL.Scheme + "://" + appURL.Host: true}
	for _, o := range origins {
		allowed[strings.TrimRight(o, "/")] = true
	}

	if host, _, err := net.SplitHostPort(*addr); err == nil && host != "127.0.0.1" && host != "localhost" && host != "::1" && *certFile == "" {
		log.Printf("WARNING: listening on %s without TLS; the token is sent in clear text. Use --tls-cert/--tls-key or a TLS reverse proxy.", *addr)
	}

	srv := &Server{ws: ws, token: *token, origins: allowed, watch: NewWatcher(ws, 2*time.Second), version: version}
	scheme := "http"
	if *certFile != "" {
		scheme = "https"
	}
	// The token goes in the URL fragment so it is never sent to any server.
	connect := fmt.Sprintf("%s/#connect=%s&token=%s", strings.TrimRight(*app, "/"),
		url.QueryEscape(scheme+"://"+*addr), *token)
	fmt.Printf("smartmark-agent %s\n  serving  %s\n  listen   %s://%s\n\nOpen this link to connect:\n  %s\n", version, ws.root, scheme, *addr, connect)

	hs := &http.Server{
		Addr: *addr, Handler: srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, IdleTimeout: 2 * time.Minute,
	}
	if *certFile != "" {
		log.Fatal(hs.ListenAndServeTLS(*certFile, *keyFile))
	}
	log.Fatal(hs.ListenAndServe())
}
