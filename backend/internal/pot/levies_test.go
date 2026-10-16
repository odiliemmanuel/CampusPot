package pot

import (
	"encoding/json"
	"testing"
	"time"
)

// TestFlexTimeUnmarshal covers the two shapes the levy dueDate arrives in: the
// bare date a browser sends from <input type="date">, and a full RFC3339
// timestamp. Previously the bare date failed with `cannot parse "T"`.
func TestFlexTimeUnmarshal(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"bare date", `{"dueDate":"2026-10-16"}`, "2026-10-16"},
		{"rfc3339", `{"dueDate":"2026-10-16T12:30:00Z"}`, "2026-10-16T12:30:00Z"},
		{"omitted", `{}`, ""},
		{"null", `{"dueDate":null}`, ""},
		{"empty", `{"dueDate":""}`, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var req CreateLevyRequest
			if err := json.Unmarshal([]byte(tc.in), &req); err != nil {
				t.Fatalf("unmarshal %s: %v", tc.in, err)
			}
			got := ""
			if req.DueDate != nil && !req.DueDate.Time().IsZero() {
				got = req.DueDate.Time().UTC().Format(time.RFC3339)
				if tc.want == "2026-10-16" {
					got = req.DueDate.Time().UTC().Format("2006-01-02")
				}
			}
			if got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}

	var bad CreateLevyRequest
	if err := json.Unmarshal([]byte(`{"dueDate":"16/10/2026"}`), &bad); err == nil {
		t.Fatal("expected an error for an unparseable date")
	}
}
