// Entry point VS Code calls inside the Extension Development Host (`--extensionTestsPath`).
// Importing the suites only registers their tests. run() installs the provider spy before any
// test can activate the extension, then runs the tests in order. Rejecting makes VS Code exit
// non-zero, which fails `npm run test:integration`.
import { runRegistered } from '../support/harness';
import { installProviderSpy } from '../support/providerSpy';
import './view.itest';
// After view.itest: it relies on the hide/show cycles above having run.
import './protocol.itest';
// After protocol.itest: it asserts that no terminal exists, and this suite creates some.
import './monitor.itest';

export async function run(): Promise<void> {
  installProviderSpy();
  const summary = await runRegistered();
  if (summary.failed.length > 0) {
    throw new Error(
      `${summary.failed.length} integration test(s) failed:\n${summary.failed.join('\n')}`,
    );
  }
  if (summary.passed === 0) {
    throw new Error('No integration tests ran.');
  }
}
