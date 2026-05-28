import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SuperpowersPlugin } from '../../.opencode/plugins/superpowers.js';

test('OpenCode plugin exposes a restricted Superpowers artifact save tool', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'superpowers-plugin-tool-'));
  const plugin = await SuperpowersPlugin({});

  assert.ok(plugin.tool.save_superpowers_artifact);

  const output = await plugin.tool.save_superpowers_artifact.execute(
    {
      kind: 'plan',
      slug: 'plugin-tool-plan',
      content: '# Plan\n',
    },
    {
      directory: projectDir,
      worktree: projectDir,
      metadata() {},
    },
  );

  assert.match(output, /docs\/superpowers\/plans\/\d{4}-\d{2}-\d{2}-plugin-tool-plan\.md/);

  const files = await fs.readdir(path.join(projectDir, 'docs', 'superpowers', 'plans'));
  assert.equal(files.length, 1);
  assert.match(files[0], /^\d{4}-\d{2}-\d{2}-plugin-tool-plan\.md$/);
});

test('OpenCode bootstrap explains the Plan Mode artifact-saving exception', async () => {
  const plugin = await SuperpowersPlugin({});
  const output = {
    messages: [
      {
        info: { role: 'user' },
        parts: [{ type: 'text', text: 'hello' }],
      },
    ],
  };

  await plugin['experimental.chat.messages.transform']({}, output);

  const bootstrap = output.messages[0].parts[0].text;
  assert.match(bootstrap, /Plan Mode artifact-saving exception/);
  assert.match(bootstrap, /save_superpowers_artifact/);
  assert.match(bootstrap, /do not defer saving to implementation/);
  assert.match(bootstrap, /docs\/superpowers\/specs/);
  assert.match(bootstrap, /docs\/superpowers\/plans/);
});

