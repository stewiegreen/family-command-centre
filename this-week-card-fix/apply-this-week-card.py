from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "src/pages/Dashboard.tsx"
PATCH = Path(__file__).resolve().parent / "this-week-card.patch"

if not TARGET.exists():
    raise SystemExit(f"Could not find {TARGET}. Run this from the extracted ZIP inside your repo, or edit ROOT in the script.")

lines = PATCH.read_text().splitlines()
old = [x[1:] for x in lines if x.startswith("-") and not x.startswith("---")]
new = [x[1:] for x in lines if x.startswith("+") and not x.startswith("+++")]

text = TARGET.read_text()
old_text = "\n".join(old)
new_text = "\n".join(new)

count = text.count(old_text)
if count == 0:
    raise SystemExit("Could not find the expected old This Week card in Dashboard.tsx. Your Dashboard.tsx is a different version; do not overwrite it.")
if count > 1:
    raise SystemExit("Found the old This Week card more than once; refusing to make an ambiguous change.")

TARGET.write_text(text.replace(old_text, new_text, 1))
print(f"Updated {TARGET}")
print("Only the This Week digest block was replaced.")
