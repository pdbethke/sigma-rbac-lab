#!/usr/bin/env python3
"""Plain-text post body -> RTF, for pasting into a long-form article editor.

    python3 docs/posts/tortf.py body.txt > body.rtf
    python3 docs/posts/tortf.py body.txt -o body.rtf

WHY THIS EXISTS
---------------
Post bodies are never written in Markdown. Markdown is a formatting language for
a renderer that isn't present: `**`, `#` and `>` paste through as literal
characters, and indented blocks paste carrying their leading whitespace. Short
posts therefore live as .txt and are pasted as-is. Long-form articles live as
.rtf so that section headings survive the paste.

.txt is the editable source. RTF is generated, never hand-edited -- the escaping
is exactly the part a human gets wrong.

WHAT NEEDS ESCAPING
-------------------
Backslash and braces are RTF syntax. Everything above U+007F must become a
\\uN? escape, and that is what breaks naive conversion here: these posts are full
of em dashes and curly quotes, which a byte-for-byte copy silently mangles.

CONVENTIONS
-----------
Paragraphs are separated by blank lines and never hard-wrapped, so one paragraph
is one line. An ALL-CAPS line is a section heading and is emitted bold.
"""
import argparse
import sys

HEADER = (
    "{\\rtf1\\ansi\\ansicpg1252\\deff0\n"
    "{\\fonttbl{\\f0\\fswiss\\fcharset0 Helvetica;}}\n"
    "\\f0\\fs24\n"
)


def escape(text):
    """RTF-escape one line. Non-ASCII becomes \\uN? with a '?' fallback char."""
    out = []
    for ch in text:
        if ch in "\\{}":
            out.append("\\" + ch)
        elif ord(ch) < 128:
            out.append(ch)
        else:
            # signed 16-bit, per the RTF spec
            code = ord(ch)
            if code > 32767:
                code -= 65536
            out.append(f"\\u{code}?")
    return "".join(out)


def is_heading(line):
    """An ALL-CAPS line is a section heading. Needs at least one letter, and no
    lowercase -- 'RUN IT BACKWARDS' yes, 'A competitor redesigns a page.' no."""
    return any(c.isalpha() for c in line) and line == line.upper()


def paragraphs(text):
    for block in text.split("\n\n"):
        block = " ".join(ln.strip() for ln in block.splitlines() if ln.strip())
        if block:
            yield block


def convert(text):
    body = []
    for para in paragraphs(text):
        esc = escape(para)
        if is_heading(para):
            body.append("\\sb360\\sa120\\b " + esc + "\\b0\\par")
        else:
            body.append("\\sb0\\sa180 " + esc + "\\par")
    return HEADER + "\n".join(body) + "\n}\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("source", help="plain-text body (.txt)")
    ap.add_argument("-o", "--out", help="write here instead of stdout")
    args = ap.parse_args()

    rtf = convert(open(args.source, encoding="utf-8").read())
    if args.out:
        with open(args.out, "w", encoding="ascii") as fh:
            fh.write(rtf)
        print(f"{args.source} -> {args.out}  ({len(rtf):,} bytes)", file=sys.stderr)
    else:
        sys.stdout.write(rtf)


if __name__ == "__main__":
    main()
