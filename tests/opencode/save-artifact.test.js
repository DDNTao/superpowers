import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { saveSuperpowersArtifact } from '../../scripts/save-superpowers-artifact.js';

async function tempProject() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'superpowers-artifact-'));
}

test('writes plan artifacts to the Superpowers plans directory', async () => {
  const projectDir = await tempProject();

  const result = await saveSuperpowersArtifact({
    kind: 'plan',
    slug: 'plan-mode-save-channel',
    content: '# Plan\n',
    projectDir,
    date: '2026-05-28',
  });

  const expected = path.join(
    projectDir,
    'docs',
    'superpowers',
    'plans',
    '2026-05-28-plan-mode-save-channel.md',
  );
  assert.equal(result.path, expected);
  assert.equal(await fs.readFile(expected, 'utf8'), '# Plan\n');
});

test('writes spec artifacts to the Superpowers specs directory with design suffix', async () => {
  const projectDir = await tempProject();

  const result = await saveSuperpowersArtifact({
    kind: 'spec',
    slug: 'plan-mode-save-channel',
    content: '# Spec\n',
    projectDir,
    date: '2026-05-28',
  });

  const expected = path.join(
    projectDir,
    'docs',
    'superpowers',
    'specs',
    '2026-05-28-plan-mode-save-channel-design.md',
  );
  assert.equal(result.path, expected);
  assert.equal(await fs.readFile(expected, 'utf8'), '# Spec\n');
});

test('dry run returns the target path without writing', async () => {
  const projectDir = await tempProject();

  const result = await saveSuperpowersArtifact({
    kind: 'plan',
    slug: 'dry-run-plan',
    content: '# Plan\n',
    projectDir,
    date: '2026-05-28',
    dryRun: true,
  });

  assert.equal(result.written, false);
  await assert.rejects(fs.stat(result.path), { code: 'ENOENT' });
});

test('rejects invalid artifact identifiers', async () => {
  const projectDir = await tempProject();

  for (const slug of ['../escape', '/absolute', 'MixedCase', 'has_underscore', '']) {
    await assert.rejects(
      saveSuperpowersArtifact({
        kind: 'plan',
        slug,
        content: '# Plan\n',
        projectDir,
        date: '2026-05-28',
      }),
      /slug must contain only lowercase letters, numbers, and hyphens/,
    );
  }
});

test('rejects symlink escapes from the Superpowers docs tree', async () => {
  const projectDir = await tempProject();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'superpowers-outside-'));
  const docsDir = path.join(projectDir, 'docs');
  await fs.mkdir(docsDir, { recursive: true });
  await fs.symlink(outside, path.join(docsDir, 'superpowers'));

  await assert.rejects(
    saveSuperpowersArtifact({
      kind: 'plan',
      slug: 'symlink-escape',
      content: '# Plan\n',
      projectDir,
      date: '2026-05-28',
    }),
    /refuses to write outside docs\/superpowers/,
  );
});
