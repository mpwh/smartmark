package main

import (
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Watcher polls the workspace while at least one client is subscribed and
// reports changed relative paths. Polling keeps the agent dependency-free and
// behaves the same on every OS and network filesystem.
type Watcher struct {
	ws       *Workspace
	interval time.Duration
	mu       sync.Mutex
	subs     map[chan []string]struct{}
	running  bool
	poke     chan struct{}
}

func NewWatcher(ws *Workspace, interval time.Duration) *Watcher {
	return &Watcher{ws: ws, interval: interval, subs: map[chan []string]struct{}{}, poke: make(chan struct{}, 1)}
}

func (w *Watcher) Subscribe() (<-chan []string, func()) {
	ch := make(chan []string, 4)
	w.mu.Lock()
	w.subs[ch] = struct{}{}
	if !w.running {
		w.running = true
		go w.loop()
	}
	w.mu.Unlock()
	return ch, func() {
		w.mu.Lock()
		delete(w.subs, ch)
		w.mu.Unlock()
	}
}

// Poke asks for an immediate scan (after the agent's own writes).
func (w *Watcher) Poke() {
	select {
	case w.poke <- struct{}{}:
	default:
	}
}

func (w *Watcher) snapshot() map[string]int64 {
	snap := map[string]int64{}
	files, _ := w.ws.List()
	for _, rel := range files {
		if st, err := os.Stat(filepath.Join(w.ws.root, filepath.FromSlash(rel))); err == nil {
			snap[rel] = st.ModTime().UnixNano() ^ st.Size()
		}
	}
	return snap
}

func diff(a, b map[string]int64) []string {
	var out []string
	for k, v := range b {
		if o, ok := a[k]; !ok || o != v {
			out = append(out, k)
		}
	}
	for k := range a {
		if _, ok := b[k]; !ok {
			out = append(out, k)
		}
	}
	return out
}

func (w *Watcher) loop() {
	prev := w.snapshot()
	t := time.NewTicker(w.interval)
	defer t.Stop()
	for {
		select {
		case <-t.C:
		case <-w.poke:
		}
		w.mu.Lock()
		if len(w.subs) == 0 {
			w.running = false
			w.mu.Unlock()
			return
		}
		w.mu.Unlock()
		cur := w.snapshot()
		if changed := diff(prev, cur); len(changed) > 0 {
			w.mu.Lock()
			for ch := range w.subs {
				select {
				case ch <- changed:
				default: // slow client: drop, it will resync on next change
				}
			}
			w.mu.Unlock()
		}
		prev = cur
	}
}
