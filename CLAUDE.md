## Report format

End your terminal output with a short Turkish summary paragraph: what was done,
the result, any open point, and your suggested next step. This Turkish summary is
mandatory in the terminal output. Appending the same summary to the shared log file
is also mandatory and is never treated as "modifying files" — it stays required even
when a task says read-only or says not to touch any file.

## Managed document folders

When a task points you at a folder of managed documents:

- Treat every file there as an artifact under external version control. Apply only
  the changes the task specifies. Never reformat, re-wrap, normalize whitespace,
  correct spelling, or otherwise improve content on your own initiative.
- If you notice something that looks wrong or damaged, report it and leave it
  untouched. Visibly broken is better than silently altered.
- Edits are byte-exact. Do not rewrite a file from a reconstructed version of its
  content; edit the bytes in place and preserve encoding and line endings.
- Any change to such a folder must be followed by regenerating the fingerprint
  manifest and reading it back. This applies to every change, whoever asked for it
  and whatever the reason.
- Files on synced mounts can be present in a listing without their contents being
  on local disk. Verify a file is fully materialized before measuring or editing it.
- A write to a synced mount can appear to succeed before it settles. Read back what
  you wrote; absence of an error is not proof the write landed.
