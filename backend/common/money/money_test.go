package money

import "testing"

func TestFromDecimalString(t *testing.T) {
	cases := []struct {
		in   string
		want Kobo
		ok   bool
	}{
		{"5000", 500000, true},
		{"5000.00", 500000, true},
		{"0.50", 50, true},
		{"0.5", 50, true},
		{"123.45", 12345, true},
		{"", 0, false},
		{"10.999", 0, false},
		{"abc", 0, false},
	}
	for _, c := range cases {
		got, err := FromDecimalString(c.in)
		if c.ok && err != nil {
			t.Errorf("%q: unexpected error %v", c.in, err)
			continue
		}
		if !c.ok {
			if err == nil {
				t.Errorf("%q: expected error", c.in)
			}
			continue
		}
		if got != c.want {
			t.Errorf("%q: got %d kobo, want %d", c.in, got, c.want)
		}
	}
}

func TestStringAndFormat(t *testing.T) {
	if got := FromNaira(5000).String(); got != "5000.00" {
		t.Errorf("String: got %q", got)
	}
	if got := FromNaira(5000).Format(); got != "₦5,000.00" {
		t.Errorf("Format: got %q", got)
	}
	if got := Kobo(123456789).Format(); got != "₦1,234,567.89" {
		t.Errorf("Format large: got %q", got)
	}
	if got := FromNaira(1234).Naira(); got != 1234 {
		t.Errorf("Naira: got %d", got)
	}
}

func TestRoundTripWebhookAmount(t *testing.T) {
	// B Moni sends amounts as decimal strings; parse must be lossless.
	k, err := FromDecimalString("999999999.99")
	if err != nil {
		t.Fatal(err)
	}
	if k.String() != "999999999.99" {
		t.Fatalf("round trip changed value: %s", k.String())
	}
}
