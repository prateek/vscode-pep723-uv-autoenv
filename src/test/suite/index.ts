import * as path from 'path';
import Mocha from 'mocha';
import globCb from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 600000 });
  const testsRoot = path.resolve(__dirname, '.');

  return new Promise((resolve, reject) => {
    globCb('**/**.test.js', { cwd: testsRoot }, (err: Error | null, files: string[]) => {
      if (err) {
        return reject(err);
      }
      files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        mocha.run((failures: number) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
            resolve();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

export function configure() {
  // no-op
}
