// Package money handles Naira amounts safely. Money is stored and passed
// around as integer kobo (1 NGN = 100 kobo) so no precision is ever lost to
// floating point — a requirement inherited from the B Moni webhook contract,
// which sends amounts as decimal strings.
package money

import (
	"fmt"
	"strconv"
	"strings"
)

// Kobo is an amount in the smallest Naira unit (1 NGN = 100 kobo).
type Kobo int64

// FromNaira converts a whole-number Naira value into Kobo.
func FromNaira(n int64) Kobo { return Kobo(n * 100) }

// FromDecimalString parses a decimal string such as "5000.00" or "5000"
// into Kobo. It rejects more than two decimal places rather than silently
// rounding money.
func FromDecimalString(s string) (Kobo, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, fmt.Errorf("money: empty amount")
	}
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")

	whole, frac, _ := strings.Cut(s, ".")
	if whole == "" {
		whole = "0"
	}
	if len(frac) > 2 {
		return 0, fmt.Errorf("money: %q has more than 2 decimal places", s)
	}
	frac += strings.Repeat("0", 2-len(frac))

	w, err := strconv.ParseInt(whole, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("money: invalid whole part %q", whole)
	}
	f, err := strconv.ParseInt(frac, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("money: invalid fractional part %q", frac)
	}

	k := Kobo(w*100 + f)
	if neg {
		k = -k
	}
	return k, nil
}

// Naira returns the value as a whole-naira int64, truncating kobo.
func (k Kobo) Naira() int64 { return int64(k) / 100 }

// String renders the amount as a decimal Naira string, e.g. "5000.00".
func (k Kobo) String() string {
	neg := k < 0
	v := k
	if neg {
		v = -v
	}
	s := fmt.Sprintf("%d.%02d", int64(v)/100, int64(v)%100)
	if neg {
		return "-" + s
	}
	return s
}

// Format renders the amount with a Naira sign and thousands separators,
// e.g. "₦5,000.00". Useful for AI and UI copy.
func (k Kobo) Format() string {
	return "₦" + withThousands(k.String())
}

func withThousands(s string) string {
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	whole, frac, _ := strings.Cut(s, ".")
	var b strings.Builder
	for i, c := range whole {
		if i > 0 && (len(whole)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	out := b.String()
	if frac != "" {
		out += "." + frac
	}
	if neg {
		out = "-" + out
	}
	return out
}
