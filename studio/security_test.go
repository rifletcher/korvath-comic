package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLocalOnly(t *testing.T) {
	var reached bool
	h := localOnly(8484, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	cases := []struct {
		name    string
		method  string
		path    string
		host    string
		origin  string
		site    string
		body    string
		wantOK  bool
		wantErr int
	}{
		{"UI read", "GET", "/api/projects", "127.0.0.1:8484", "", "same-origin", "", true, 0},
		{"UI post", "POST", "/api/gate/approve", "127.0.0.1:8484", "http://127.0.0.1:8484", "same-origin", `{"projectId":"korvath-the-barbarian","episodeId":"ep01"}`, true, 0},
		{"localhost alias", "POST", "/api/queue/pause", "localhost:8484", "http://localhost:8484", "same-origin", "", true, 0},
		{"cli without origin", "POST", "/api/queue/pause", "127.0.0.1:8484", "", "", "", true, 0},
		{"static file", "GET", "/workspace-docs/index.html", "127.0.0.1:8484", "", "", "", true, 0},
		{"foreign site post", "POST", "/api/project/delete", "127.0.0.1:8484", "https://evil.example", "cross-site", `{"projectId":"korvath-the-barbarian"}`, false, 403},
		{"foreign origin only", "POST", "/api/project/delete", "127.0.0.1:8484", "https://evil.example", "", `{"projectId":"x"}`, false, 403},
		{"null origin", "POST", "/api/project/delete", "127.0.0.1:8484", "null", "", `{}`, false, 403},
		{"cross-site no-cors get", "GET", "/api/projects", "127.0.0.1:8484", "", "cross-site", "", false, 403},
		{"dns rebinding host", "GET", "/api/projects", "evil.example:8484", "", "", "", false, 403},
		{"get on mutating endpoint", "GET", "/api/project/delete", "127.0.0.1:8484", "", "", "", false, 405},
		{"path traversal in body", "POST", "/api/upload/screenshot", "127.0.0.1:8484", "", "", `{"projectId":"../../Windows"}`, false, 400},
		{"path traversal in query", "GET", "/api/episode", "127.0.0.1:8484", "", "", "", false, 400},
		{"non-string id", "POST", "/api/gate/approve", "127.0.0.1:8484", "", "", `{"projectId":5}`, false, 400},
		{"empty id allowed", "POST", "/api/youtube/upload", "127.0.0.1:8484", "", "", `{"projectId":""}`, true, 0},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			reached = false
			path := c.path
			if c.name == "path traversal in query" {
				path += "?project=..%2F..%2Fsecret&episode=ep01"
			}
			req := httptest.NewRequest(c.method, path, strings.NewReader(c.body))
			req.Host = c.host
			if c.origin != "" {
				req.Header.Set("Origin", c.origin)
			}
			if c.site != "" {
				req.Header.Set("Sec-Fetch-Site", c.site)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if reached != c.wantOK {
				t.Fatalf("reached handler = %v, want %v (status %d: %s)", reached, c.wantOK, rec.Code, rec.Body.String())
			}
			if !c.wantOK && rec.Code != c.wantErr {
				t.Fatalf("status = %d, want %d", rec.Code, c.wantErr)
			}
		})
	}
}

func TestBodyStillReadableByHandler(t *testing.T) {
	var got string
	h := localOnly(8484, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b := new(bytes.Buffer)
		_, _ = b.ReadFrom(r.Body)
		got = b.String()
	}))
	body := `{"projectId":"korvath-the-barbarian","episodeId":"ep02","notes":"ok"}`
	req := httptest.NewRequest("POST", "/api/gate/approve", strings.NewReader(body))
	req.Host = "127.0.0.1:8484"
	h.ServeHTTP(httptest.NewRecorder(), req)
	if got != body {
		t.Fatalf("handler saw %q, want original body", got)
	}
}
