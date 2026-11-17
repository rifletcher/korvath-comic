package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// maxRequestBody caps JSON request bodies (screenshots arrive base64-encoded).
const maxRequestBody = 64 << 20 // 64 MB

// readOnlyAPI lists the /api/ endpoints that may be called with GET.
// Every other /api/ endpoint changes state and must be a POST.
var readOnlyAPI = map[string]bool{
	"/api/projects":           true,
	"/api/pool":               true,
	"/api/episode":            true,
	"/api/events":             true,
	"/api/comic/chat/history": true,
	"/api/project/characters": true, // GET reads, POST saves
	"/api/stage/audit":        true,
	"/api/youtube/status":     true,
	"/api/audio/cast-check":   true,
}

// localOnly protects the Studio server from other websites open in the same
// browser (CSRF) and from DNS-rebinding attacks:
//   - the Host header must be this machine on this port
//   - a browser Origin header, when present, must be this server
//   - state-changing /api/ calls must be POST
//
// Requests without an Origin header (curl, Node workers) are allowed: any local
// process can already read and write the workspace files directly.
func localOnly(port int, next http.Handler) http.Handler {
	allowedHosts := map[string]bool{}
	for _, h := range []string{"127.0.0.1", "localhost", "[::1]"} {
		allowedHosts[h+":"+strconv.Itoa(port)] = true
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !allowedHosts[strings.ToLower(r.Host)] {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}

		if origin := r.Header.Get("Origin"); origin != "" && origin != "null" {
			u, err := url.Parse(origin)
			if err != nil || !allowedHosts[strings.ToLower(u.Host)] {
				http.Error(w, "forbidden origin", http.StatusForbidden)
				return
			}
		} else if origin == "null" {
			http.Error(w, "forbidden origin", http.StatusForbidden)
			return
		}

		// Browsers send this on every modern request; reject anything a foreign site initiated.
		if site := r.Header.Get("Sec-Fetch-Site"); site == "cross-site" || site == "same-site" {
			http.Error(w, "forbidden cross-site request", http.StatusForbidden)
			return
		}

		if strings.HasPrefix(r.URL.Path, "/api/") {
			if r.Method != http.MethodPost && !(r.Method == http.MethodGet && readOnlyAPI[r.URL.Path]) {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			if err := checkIDs(w, r); err != "" {
				http.Error(w, err, http.StatusBadRequest)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// safeID matches project and episode identifiers (slugs such as
// "korvath-the-barbarian" or "ep01"). It rules out path separators and "..",
// so an ID can never escape the projects/ directory.
var safeID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$`)

var idFields = []string{"project", "episode", "projectId", "episodeId"}

// checkIDs validates project/episode IDs in the query string and JSON body,
// caps the body size, and restores the body for the real handler.
// Returns an error message, or "" when the request is fine.
func checkIDs(w http.ResponseWriter, r *http.Request) string {
	q := r.URL.Query()
	for _, k := range idFields {
		if v := q.Get(k); v != "" && !safeID.MatchString(v) {
			return "invalid " + k
		}
	}

	if r.Body == nil || r.Method != http.MethodPost {
		return ""
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxRequestBody))
	if err != nil {
		return "request body too large or unreadable"
	}
	r.Body = io.NopCloser(bytes.NewReader(body))

	var fields map[string]interface{}
	if len(bytes.TrimSpace(body)) == 0 || json.Unmarshal(body, &fields) != nil {
		return "" // not a JSON object; the handler decides what to do with it
	}
	for _, k := range idFields {
		if v, ok := fields[k]; ok && v != nil {
			str, isStr := v.(string)
			if !isStr || (str != "" && !safeID.MatchString(str)) {
				return "invalid " + k
			}
		}
	}
	return ""
}
