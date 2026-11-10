package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
)

func resolveWorkspaceRoot() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}
	if _, err := os.Stat(filepath.Join(cwd, "projects")); err == nil {
		return cwd
	}
	parent := filepath.Dir(cwd)
	if _, err := os.Stat(filepath.Join(parent, "projects")); err == nil {
		return parent
	}
	return cwd
}

func main() {
	port := flag.Int("port", 8484, "Port for the Studio UI & IPC Bridge")
	openWindow := flag.Bool("window", false, "Open native desktop app window on launch")
	flag.Parse()

	rootDir := resolveWorkspaceRoot()
	frontendDir := filepath.Join(rootDir, "studio", "frontend", "dist")

	app := NewApp(rootDir)
	app.Startup(context.Background())

	mux := http.NewServeMux()
	app.RegisterHTTPHandlers(mux, frontendDir)

	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	url := fmt.Sprintf("http://%s", addr)

	fmt.Println("======================================================================")
	fmt.Println("⚔️  CONAN MULTI-COMIC STUDIO — GO + WAILS PIPELINE ORCHESTRATOR")
	fmt.Println("======================================================================")
	fmt.Printf("📁 Workspace Root : %s\n", rootDir)
	fmt.Printf("🌐 Studio UI URL  : %s\n", url)
	fmt.Println("🛡️  Gates Active  : Gate A (Script) | Gate B (8-Pt Visual) | Gate C (Audio)")
	fmt.Println("======================================================================")

	if *openWindow {
		go func() {
			// Launch native frameless WebView/App window on Windows
			_ = exec.Command("cmd", "/c", "start", "chrome", fmt.Sprintf("--app=%s", url), "--window-size=1480,940").Start()
		}()
	}

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Studio server error: %v", err)
	}
}

