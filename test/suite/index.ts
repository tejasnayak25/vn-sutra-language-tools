import * as path from "path";
import Mocha = require("mocha");
import * as fs from "fs";

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: "tdd",
    color: true
  });

  const testsRoot = __dirname;

  return new Promise((resolve, reject) => {
    fs.readdirSync(testsRoot)
      .filter((file) => file.endsWith(".test.js"))
      .forEach((file) => mocha.addFile(path.resolve(testsRoot, file)));

    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
