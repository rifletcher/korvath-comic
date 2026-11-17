package models

import (
	"bytes"
	"encoding/json"
	"reflect"
	"sort"
	"strings"
	"sync"
)

// Extra holds JSON fields a struct doesn't declare. The Node workers add
// fields to manifests (YouTube links, thumbnails, audio clip records, voice
// director notes, per-line delivery settings, ...). Without this, every save
// from the Go side would silently delete them.
type Extra map[string]json.RawMessage

var knownFieldsCache sync.Map // reflect.Type -> map[string]bool

func knownJSONFields(t reflect.Type) map[string]bool {
	if v, ok := knownFieldsCache.Load(t); ok {
		return v.(map[string]bool)
	}
	known := map[string]bool{}
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		tag := f.Tag.Get("json")
		if tag == "-" {
			continue
		}
		name := strings.Split(tag, ",")[0]
		if name == "" {
			name = f.Name
		}
		known[name] = true
	}
	knownFieldsCache.Store(t, known)
	return known
}

// unmarshalKeepingExtra decodes data into alias (a pointer to an alias type of
// the struct) and returns the fields the struct doesn't declare.
func unmarshalKeepingExtra(data []byte, alias interface{}) (Extra, error) {
	if err := json.Unmarshal(data, alias); err != nil {
		return nil, err
	}
	var all map[string]json.RawMessage
	if err := json.Unmarshal(data, &all); err != nil {
		return nil, nil // not an object; nothing extra to keep
	}
	known := knownJSONFields(reflect.TypeOf(alias).Elem())
	for k := range all {
		if known[k] {
			delete(all, k)
		}
	}
	if len(all) == 0 {
		return nil, nil
	}
	return all, nil
}

// marshalKeepingExtra encodes alias and appends the extra fields after the
// declared ones, so the declared field order in the file is unchanged.
func marshalKeepingExtra(alias interface{}, extra Extra) ([]byte, error) {
	b, err := json.Marshal(alias)
	if err != nil || len(extra) == 0 {
		return b, err
	}
	known := knownJSONFields(reflect.TypeOf(alias))
	keys := make([]string, 0, len(extra))
	for k := range extra {
		if !known[k] {
			keys = append(keys, k)
		}
	}
	if len(keys) == 0 {
		return b, nil
	}
	sort.Strings(keys)
	var buf bytes.Buffer
	trimmed := bytes.TrimRight(b, " \n\r\t")
	buf.Write(trimmed[:len(trimmed)-1]) // drop closing brace
	needComma := !bytes.Equal(bytes.TrimSpace(trimmed[:len(trimmed)-1]), []byte("{"))
	for _, k := range keys {
		if needComma {
			buf.WriteByte(',')
		}
		kb, _ := json.Marshal(k)
		buf.Write(kb)
		buf.WriteByte(':')
		buf.Write(extra[k])
		needComma = true
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

func (p *Project) UnmarshalJSON(b []byte) error {
	type alias Project
	var a alias
	extra, err := unmarshalKeepingExtra(b, &a)
	if err != nil {
		return err
	}
	*p = Project(a)
	p.Extra = extra
	return nil
}

func (p Project) MarshalJSON() ([]byte, error) {
	type alias Project
	return marshalKeepingExtra(alias(p), p.Extra)
}

func (o *EpisodeOutputs) UnmarshalJSON(b []byte) error {
	type alias EpisodeOutputs
	var a alias
	extra, err := unmarshalKeepingExtra(b, &a)
	if err != nil {
		return err
	}
	*o = EpisodeOutputs(a)
	o.Extra = extra
	return nil
}

func (o EpisodeOutputs) MarshalJSON() ([]byte, error) {
	type alias EpisodeOutputs
	return marshalKeepingExtra(alias(o), o.Extra)
}

func (s *Stage) UnmarshalJSON(b []byte) error {
	type alias Stage
	var a alias
	extra, err := unmarshalKeepingExtra(b, &a)
	if err != nil {
		return err
	}
	*s = Stage(a)
	s.Extra = extra
	return nil
}

func (s Stage) MarshalJSON() ([]byte, error) {
	type alias Stage
	return marshalKeepingExtra(alias(s), s.Extra)
}

func (g *Gate) UnmarshalJSON(b []byte) error {
	type alias Gate
	var a alias
	extra, err := unmarshalKeepingExtra(b, &a)
	if err != nil {
		return err
	}
	*g = Gate(a)
	g.Extra = extra
	return nil
}

func (g Gate) MarshalJSON() ([]byte, error) {
	type alias Gate
	return marshalKeepingExtra(alias(g), g.Extra)
}

func (d *DialogueLine) UnmarshalJSON(b []byte) error {
	type alias DialogueLine
	var a alias
	extra, err := unmarshalKeepingExtra(b, &a)
	if err != nil {
		return err
	}
	*d = DialogueLine(a)
	d.Extra = extra
	return nil
}

func (d DialogueLine) MarshalJSON() ([]byte, error) {
	type alias DialogueLine
	return marshalKeepingExtra(alias(d), d.Extra)
}

func (c *PanelCandidate) UnmarshalJSON(b []byte) error {
	type alias PanelCandidate
	var a alias
	extra, err := unmarshalKeepingExtra(b, &a)
	if err != nil {
		return err
	}
	*c = PanelCandidate(a)
	c.Extra = extra
	return nil
}

func (c PanelCandidate) MarshalJSON() ([]byte, error) {
	type alias PanelCandidate
	return marshalKeepingExtra(alias(c), c.Extra)
}

func (p *Panel) UnmarshalJSON(b []byte) error {
	type alias Panel
	var a alias
	extra, err := unmarshalKeepingExtra(b, &a)
	if err != nil {
		return err
	}
	*p = Panel(a)
	p.Extra = extra
	return nil
}

func (p Panel) MarshalJSON() ([]byte, error) {
	type alias Panel
	return marshalKeepingExtra(alias(p), p.Extra)
}

func (m *EpisodeManifest) UnmarshalJSON(b []byte) error {
	type alias EpisodeManifest
	var a alias
	extra, err := unmarshalKeepingExtra(b, &a)
	if err != nil {
		return err
	}
	*m = EpisodeManifest(a)
	m.Extra = extra
	return nil
}

func (m EpisodeManifest) MarshalJSON() ([]byte, error) {
	type alias EpisodeManifest
	return marshalKeepingExtra(alias(m), m.Extra)
}
