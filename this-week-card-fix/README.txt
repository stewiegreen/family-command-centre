GreenHQ — This Week card (safe replacement)

The previous ZIP contained an invalid git patch header. Sorry — this ZIP fixes that without requiring you to replace Dashboard.tsx wholesale.

1. Extract this folder into the root of your repo so the structure is:
   repo-clone/this-week-card-fix/
2. From the repo root run:
   python3 this-week-card-fix/apply-this-week-card.py

The script finds the exact old This Week card and replaces ONLY that block in src/pages/Dashboard.tsx. It refuses to change the file if it cannot find exactly one matching block.

It does not touch any other project files.
