# DDNTao Superpowers Fork Notes

This fork keeps a small local patch stack on top of `obra/superpowers` for
Plan Mode artifact persistence.

## Custom Branch

- Branch: `detao/plan-mode-artifacts`
- Upstream remote: `upstream` -> `git@github.com:obra/superpowers.git`
- Fork remote: `origin` -> `git@github.com:DDNTao/superpowers.git`

## Local Changes

- Adds `save_superpowers_artifact` to the OpenCode plugin.
- Adds `scripts/save-superpowers-artifact.js` for restricted Superpowers
  spec/plan Markdown writes.
- Updates Superpowers planning skills so Plan Mode may save only
  `docs/superpowers/specs/*.md` and `docs/superpowers/plans/*.md`.
- Adds tests for the restricted writer and OpenCode tool wrapper.

## Updating From Upstream

Accept upstream release notes and changelog files as the source of truth. Keep
fork-specific notes in this file, not in upstream release documents.

```bash
git fetch upstream --tags
git checkout detao/plan-mode-artifacts
git rebase upstream/main
```

If release note files conflict during the rebase, accept upstream:

```bash
git checkout --theirs CHANGELOG.md RELEASE-NOTES.md
git add CHANGELOG.md RELEASE-NOTES.md
git rebase --continue
```

Then verify the fork patch still works:

```bash
node --test tests/opencode/save-artifact.test.js tests/opencode/plugin-save-tool.test.js
```

Push the rebased custom branch:

```bash
git push --force-with-lease origin detao/plan-mode-artifacts
```

## OpenCode Plugin URL

Point OpenCode at this branch:

```json
"plugin": [
  "superpowers@git+https://github.com/DDNTao/superpowers.git#detao/plan-mode-artifacts"
]
```
