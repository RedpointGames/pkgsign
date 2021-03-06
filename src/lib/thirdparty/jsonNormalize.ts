/**
 *
 * This file originates from json-normalize, which does not correctly ship files in dist/
 * suitable for distribution. It has runtime dependencies on Babel, which we don't want
 * to pull in.
 *
 * We've copied the implementation of json-normalize here, so that we can run it through
 * TypeScript along with the rest of our code.
 *
 * We've also removed the references to the 'crypto' module, and the associated functions
 * that depend on it, as we do not need this capability.
 *
 */

/**
 * Used by serialize to handle literal values.
 * @param {function} recurse The serialize function.
 * @param {string} key The key for the current value (if one exists).
 * @param {string|number|boolean|null} value The literal to parse.
 * @param {function|undefined} replacer The replacer function.
 * @param {function} done A callback for completion.
 * @returns {string} The JSON.stringified literal value.
 */
function handleLiteral(
  recurse: any,
  value: any,
  done: (err: any, value?: any) => void
) {
  let error = null;
  let results;

  // Attempt to JSON parse literal value
  try {
    results = JSON.stringify(value);
  } catch (e) {
    error = e;
  }
  return done(error, results);
}

/**
 * Used by serialize to array and plain object values.
 * @param {object|Array} object The object to process.
 * @param {function} recurse The serialize function.
 * @param {function|undefined} replacer The replacer function.
 * @param {function} done A callback for completion.
 * @returns {string} The JSON.stringified object value.
 */
function handleObject(
  recurse: (
    obj: any,
    replacer: undefined | ((this: any, key: string, value: any) => any),
    complete: (err: any, value: any) => void,
    key: undefined | string
  ) => string | void,
  obj: any,
  replacer: undefined | ((this: any, key: string, value: any) => any),
  done: (err: any, value?: any) => void
) {
  const keys = Object.keys(obj);
  const isArray = obj instanceof Array;
  let handledError: Error | null = null;
  let complete = 0;
  const values: any[] = [];

  const onComplete = () =>
    done(
      null,
      isArray
        ? `[${values.map(v => (v === null ? "null" : v)).join(",")}]`
        : `{${values
            .sort()
            .filter(Boolean)
            .join(",")}}`
    );

  // When an object key is serialized, it calls this method as its callback.
  const onSerialized = (
    e: Error | null,
    value: string | null,
    index: number | undefined
  ) => {
    if (handledError) {
      return null;
    } else if (e) {
      handledError = e;
      return done(e);
    }

    if (index !== undefined) {
      values[index] = typeof value === "undefined" ? null : value;
    }
    if (++complete !== keys.length) return null;
    return onComplete();
  };

  // Serializes each item in an array.
  const mapArray = (key: string, index: number) =>
    recurse(
      typeof obj[key] === "undefined" ? null : obj[key],
      replacer,
      (e, val) => onSerialized(e, val, index),
      key
    );

  // Serializes each item in an object.
  const mapObject = (key: string, index: number) =>
    typeof obj[key] === "undefined"
      ? onSerialized(null, null, undefined)
      : recurse(
          obj[key],
          replacer,
          (e, val) =>
            onSerialized(
              e,
              typeof val === "undefined" ? null : `"${key}":${val}`,
              index
            ),
          key
        );

  // Map the object's keys to its respective object type function
  return keys.length === 0
    ? onComplete()
    : keys.map(isArray ? mapArray : mapObject);
}

/**
 * Handles calling the "replacer" argument to both the "serialize" and "serializeSync" methods.
 * @param {any} val The value to pass to the replacer function.
 * @param {string} key The key argument to pass to the replacer function.
 * @param {function|undefined} replacer The replacer function to call.
 * @returns {object} An object containing the new value, and "new" replacer function to pass along
 * in regard to recursion.
 */
function handleReplacer(
  val: any,
  key?: string,
  replacer?: (this: any, key: string, value: any) => any
): {
  value: any;
  onValue: undefined | ((this: any, key: string, value: any) => any);
} {
  let value = val;
  let onValue = replacer;

  if (typeof onValue === "function") {
    if (key === undefined) {
      throw new Error("key is undefined in handleReplacer");
    }

    value = onValue(key, value);
    onValue = typeof value === "object" ? onValue : undefined;
  } else if (typeof value === "function") {
    value = undefined;
  }

  return { value, onValue };
}

/**
 * Seralizes an object into "normalized json", which can be used as a key, etc.
 * @param {object} obj The object to serialize.
 * @param {function=} replacer A function that's called for each item, like the replacer
 * function passed to JSON.stringify.
 * @param {function} complete A callback for completion.
 * @param {string|undefined} key The parent key, used in recursion by "handleObject" and passed
 * to the replacer function.
 * @returns {undefined}
 */
function serialize(
  obj: any,
  replacerFunction: undefined | ((this: any, key: string, value: any) => any),
  done: (err: any, value: any) => void,
  key: undefined | string
): void {
  // No reason to continue, no callback was provided.
  if (typeof done !== "function") return;

  // Simulates the JSON.stringify replacer function
  const { value, onValue } = handleReplacer(obj, key, replacerFunction);

  process.nextTick(() =>
    !value || typeof value !== "object"
      ? handleLiteral(serialize, value, done)
      : handleObject(serialize, value, onValue, done)
  );
}

/**
 * Syncronously seralizes an object into "normalized json", which can be used as a key, etc.
 * @param {object} obj The object to serialize.
 * @param {function=} replacer A function that's called for each item, like the replacer
 * function passed to JSON.stringify.
 * @returns {string} A "normalized JSON string", which always returns the same string, if passed
 * the same object, regardless of key order.
 */
function serializeSync(
  obj: any,
  replacer: undefined | ((this: any, key: string, value: any) => any),
  complete: undefined | ((err: any, value: any) => void),
  key: undefined | string
): string {
  let done = complete;
  let results: string = "";

  // Create a callback for when stringification is complete
  if (typeof done !== "function")
    done = (err, value) => {
      results = value;
    };

  // Simulates the JSON.stringify replacer function
  const { value, onValue } = handleReplacer(obj, key, replacer);

  if (!value || typeof value !== "object") {
    handleLiteral(serializeSync, value, done);
  } else {
    handleObject(serializeSync, value, onValue, done);
  }

  return results;
}

/**
 * Exported wrapper around the serialize function.
 * @param {object} obj The object to serialize.
 * @param {function=} replacer A function that's called for each item, like the replacer
 * function passed to JSON.stringify.
 * @param {function} complete A callback for completion.
 * @returns {undefined}
 */
export function normalize(
  obj: any,
  replacer: undefined | ((this: any, key: string, value: any) => any),
  complete: (err: any, value: string) => void
): void {
  return serialize(obj, replacer, complete, undefined);
}

/**
 * Exported wrapper around the serializeSync function.
 * @param {object} obj The object to serialize.
 * @param {function=} replacer A function that's called for each item, like the replacer
 * function passed to JSON.stringify.
 * @returns {string} A "normalized JSON string", which always returns the same string, if passed
 * the same object, regardless of key order.
 */
export function normalizeSync(
  obj: any,
  replacer?: (this: any, key: string, value: any) => any
): string {
  return serializeSync(obj, replacer, undefined, undefined);
}
