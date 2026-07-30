# Patch overlay

Fixes the transform cannot make on its own, applied to the transpiled output after every pass.

The module and type passes are rules: they handle a whole class of cases or none. A few fixes need
judgement instead, mostly the strict-mode long tail that the codemod does not reach. Those live here
as unified diffs against `build/package`.

## Creating a patch

1. `npm run build` to produce `build/package`.
2. Edit the file under `build/package` to make the fix.
3. From inside `build/package`, `git diff` (or `git diff --no-index` against a copy) to capture the
   change, and save it here as `NNN-short-name.patch`.

## The rule

Every patch is checked before it is applied. A patch that no longer applies is a **loud build
failure**, never a silent no-op: a patch that quietly stops matching is how a fork rots. When a new
upstream release moves the patched code, the build fails here, which is the signal to refresh the
patch. Keep each patch small and single-purpose so refreshing it is easy.
