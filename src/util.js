const fs = require('fs-extra');
const path = require('path');
const isPromise = require('is-promise');

module.exports.debug = require('debug')('vault-pki');

/**
 * Runs a function once, then re-runs the function at a specified interval.
 *
 * @param {Function} fn The function to run. May be a regular or async function.
 * @param {Function|number} wait The amount of time to wait. May be a function taking (err, data).
 * @param {Function} onUpdate The function to run after the initial update, and after each subsequent update.
 */
const onceThenRepeat = (fn, wait, onUpdate) => {
  let result;
  try {
    result = fn();
    if (!isPromise(result)) result = new Promise((resolve) => resolve(result));
  } catch (err) {
    result = new Promise((_, reject) => reject(err));
  }

  result
    .then((data) => {
      onUpdate(null, data);
      const timeout = typeof wait === 'function' ? wait(null, data) : wait;
      setTimeout(() => onceThenRepeat(fn, wait, onUpdate), timeout);
    })
    .catch((err) => {
      onUpdate(err, null);
      const timeout = typeof wait === 'function' ? wait(err, null) : wait;
      setTimeout(() => onceThenRepeat(fn, wait, onUpdate), timeout);
    });
};
module.exports.onceThenRepeat = onceThenRepeat;


module.exports.readFileOrFolder = async (pathArrayOrBuffer) => {
  const allFileContents = await Promise.all(
    (Array.isArray(pathArrayOrBuffer) ? pathArrayOrBuffer : [pathArrayOrBuffer])
      .map(async (pathOrBuffer) => {
        if (!(await fs.pathExists(pathOrBuffer))) return [pathOrBuffer];

        let files = [pathOrBuffer];
        if ((await fs.promises.lstat(pathOrBuffer)).isDirectory()) {
          files = (await fs.promises.readdir(pathOrBuffer))
            .map((f) => path.join(pathOrBuffer, f));
        }

        return files.map(async (f) => (await fs.lstat(f)).isFile() && fs.promises.readFile(f));
      })
  );

  return (await Promise.all(
    allFileContents.reduce((accum, elem) => [...accum, ...elem], [])
  )).filter((a) => a);
};
