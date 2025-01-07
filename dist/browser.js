(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/metro.mjs
  var metro_exports = {};
  __export(metro_exports, {
    client: () => client,
    formdata: () => formdata,
    metroError: () => metroError,
    request: () => request,
    response: () => response,
    trace: () => trace,
    url: () => url
  });
  var metroURL = "https://metro.muze.nl/details/";
  if (!Symbol.metroProxy) {
    Symbol.metroProxy = Symbol("isProxy");
  }
  if (!Symbol.metroSource) {
    Symbol.metroSource = Symbol("source");
  }
  var Client = class _Client {
    #options = {
      url: typeof window != "undefined" ? window.location : "https://localhost"
    };
    #verbs = ["get", "post", "put", "delete", "patch", "head", "options", "query"];
    static tracers = {};
    /**
     * @typedef {Object} ClientOptions
     * @property {Array} middlewares - list of middleware functions
     * @property {string|URL} url - default url of the client
     * @property {[string]} verbs - a list of verb methods to expose, e.g. ['get','post']
     * 
     * Constructs a new metro client. Can have any number of params.
     * @params {ClientOptions|URL|Function|Client}
     * @returns {Client} - A metro client object with given or default verb methods
     */
    constructor(...options) {
      for (let option of options) {
        if (typeof option == "string" || option instanceof String) {
          this.#options.url = "" + option;
        } else if (option instanceof _Client) {
          Object.assign(this.#options, option.#options);
        } else if (option instanceof Function) {
          this.#addMiddlewares([option]);
        } else if (option && typeof option == "object") {
          for (let param in option) {
            if (param == "middlewares") {
              this.#addMiddlewares(option[param]);
            } else if (typeof option[param] == "function") {
              this.#options[param] = option[param](this.#options[param], this.#options);
            } else {
              this.#options[param] = option[param];
            }
          }
        }
      }
      if (this.#options.verbs) {
        this.#verbs = this.#options.verbs;
        delete this.#options.verbs;
      }
      for (const verb of this.#verbs) {
        this[verb] = async function(...options2) {
          return this.fetch(request(
            this.#options,
            ...options2,
            { method: verb.toUpperCase() }
          ));
        };
      }
      Object.freeze(this);
    }
    #addMiddlewares(middlewares) {
      if (typeof middlewares == "function") {
        middlewares = [middlewares];
      }
      let index = middlewares.findIndex((m) => typeof m != "function");
      if (index >= 0) {
        throw metroError("metro.client: middlewares must be a function or an array of functions " + metroURL + "client/invalid-middlewares-value/", middlewares[index]);
      }
      if (!Array.isArray(this.#options.middlewares)) {
        this.#options.middlewares = [];
      }
      this.#options.middlewares = this.#options.middlewares.concat(middlewares);
    }
    /**
     * Mimics the standard browser fetch method, but uses any middleware installed through
     * the constructor.
     * @param {Request|string|Object} - Required. The URL or Request object, accepts all types that are accepted by metro.request
     * @param {Object} - Optional. Any object that is accepted by metro.request
     * @return {Promise<Response|*>} - The metro.response to this request, or any other result as changed by any included middleware.
     */
    fetch(req, options) {
      req = request(req, options);
      if (!req.url) {
        throw metroError("metro.client." + req.method.toLowerCase() + ": Missing url parameter " + metroURL + "client/missing-url-param/", req);
      }
      if (!options) {
        options = {};
      }
      if (!(typeof options === "object") || Array.isArray(options) || options instanceof String) {
        throw metroError("metro.client.fetch: Options is not an object");
      }
      const metrofetch = async function browserFetch(req2) {
        if (req2[Symbol.metroProxy]) {
          if (req2.body && req2.body[Symbol.metroSource]) {
            let body = req2.body[Symbol.metroSource];
            req2 = new Request(req2[Symbol.metroSource], { body });
          } else {
            req2 = req2[Symbol.metroSource];
          }
        }
        const res = await fetch(req2);
        return response(res);
      };
      let middlewares = [metrofetch].concat(this.#options?.middlewares?.slice() || []);
      options = Object.assign({}, this.#options, options);
      let next;
      for (let middleware of middlewares) {
        next = /* @__PURE__ */ function(next2, middleware2) {
          return async function(req2) {
            let res;
            let tracers = Object.values(_Client.tracers);
            for (let tracer of tracers) {
              if (tracer.request) {
                tracer.request.call(tracer, req2, middleware2);
              }
            }
            res = await middleware2(req2, next2);
            for (let tracer of tracers) {
              if (tracer.response) {
                tracer.response.call(tracer, res, middleware2);
              }
            }
            return res;
          };
        }(next, middleware);
      }
      return next(req);
    }
    with(...options) {
      return new _Client(this, ...options);
    }
  };
  function client(...options) {
    return new Client(...options);
  }
  function bodyProxy(body, r) {
    let source = r.body;
    if (!source) {
      if (body === null) {
        source = new ReadableStream();
      } else if (body instanceof ReadableStream) {
        source = body;
      } else if (body instanceof Blob) {
        source = body.stream();
      } else {
        source = new ReadableStream({
          start(controller) {
            let chunk;
            switch (typeof body) {
              case "object":
                if (typeof body.toString == "function") {
                  chunk = body.toString();
                } else if (body instanceof FormData) {
                  chunk = new URLSearchParams(body).toString();
                } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
                  chunk = body;
                } else {
                  throw metroError("Cannot convert body to ReadableStream", body);
                }
                break;
              case "string":
              case "number":
              case "boolean":
                chunk = body;
                break;
              default:
                throw metroError("Cannot convert body to ReadableStream", body);
                break;
            }
            controller.enqueue(chunk);
            controller.close();
          }
        });
      }
    }
    return new Proxy(source, {
      get(target, prop, receiver) {
        switch (prop) {
          case Symbol.metroProxy:
            return true;
            break;
          case Symbol.metroSource:
            return body;
            break;
          case "toString":
            return function() {
              return "" + body;
            };
            break;
        }
        if (body && typeof body == "object") {
          if (prop in body) {
            if (typeof body[prop] == "function") {
              return function(...args) {
                return body[prop].apply(body, args);
              };
            }
            return body[prop];
          }
        }
        if (prop in target && prop != "toString") {
          if (typeof target[prop] == "function") {
            return function(...args) {
              return target[prop].apply(target, args);
            };
          }
          return target[prop];
        }
      },
      has(target, prop) {
        if (body && typeof body == "object") {
          return prop in body;
        } else {
          return prop in target;
        }
      },
      ownKeys(target) {
        if (body && typeof body == "object") {
          return Reflect.ownKeys(body);
        } else {
          return Reflect.ownKeys(target);
        }
      },
      getOwnPropertyDescriptor(target, prop) {
        if (body && typeof body == "object") {
          return Object.getOwnPropertyDescriptor(body, prop);
        } else {
          return Object.getOwnPropertyDescriptor(target, prop);
        }
      }
    });
  }
  function getRequestParams(req, current) {
    let params = current || {};
    if (!params.url && current.url) {
      params.url = current.url;
    }
    for (let prop of [
      "method",
      "headers",
      "body",
      "mode",
      "credentials",
      "cache",
      "redirect",
      "referrer",
      "referrerPolicy",
      "integrity",
      "keepalive",
      "signal",
      "priority",
      "url"
    ]) {
      if (typeof req[prop] == "function") {
        req[prop](params[prop], params);
      } else if (typeof req[prop] != "undefined") {
        if (prop == "url") {
          params.url = url(params.url, req.url);
        } else if (prop == "headers") {
          params.headers = new Headers(current.headers);
          if (!(req.headers instanceof Headers)) {
            req.headers = new Headers(req.headers);
          }
          for (let [key, value] of req.headers.entries()) {
            params.headers.set(key, value);
          }
        } else {
          params[prop] = req[prop];
        }
      }
    }
    return params;
  }
  function request(...options) {
    let requestParams = {
      url: typeof window != "undefined" ? window.location : "https://localhost/",
      duplex: "half"
      // required when setting body to ReadableStream, just set it here by default already
    };
    for (let option of options) {
      if (typeof option == "string" || option instanceof URL || option instanceof URLSearchParams) {
        requestParams.url = url(requestParams.url, option);
      } else if (option && (option instanceof FormData || option instanceof ReadableStream || option instanceof Blob || option instanceof ArrayBuffer || option instanceof DataView)) {
        requestParams.body = option;
      } else if (option && typeof option == "object") {
        Object.assign(requestParams, getRequestParams(option, requestParams));
      }
    }
    let body = requestParams.body;
    if (body) {
      if (typeof body == "object" && !(body instanceof String) && !(body instanceof ReadableStream) && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && !(body instanceof DataView) && !(body instanceof FormData) && !(body instanceof URLSearchParams) && (typeof TypedArray == "undefined" || !(body instanceof TypedArray))) {
        requestParams.body = JSON.stringify(body);
      }
    }
    let r = new Request(requestParams.url, requestParams);
    Object.freeze(r);
    return new Proxy(r, {
      get(target, prop, receiver) {
        switch (prop) {
          case Symbol.metroSource:
            return target;
            break;
          case Symbol.metroProxy:
            return true;
            break;
          case "with":
            return function(...options2) {
              if (body) {
                options2.unshift({ body });
              }
              return request(target, ...options2);
            };
            break;
          case "body":
            if (!body) {
              body = target.body;
            }
            if (body) {
              if (body[Symbol.metroProxy]) {
                return body;
              }
              return bodyProxy(body, target);
            }
            break;
        }
        if (target[prop] instanceof Function) {
          return target[prop].bind(target);
        }
        return target[prop];
      }
    });
  }
  function getResponseParams(res, current) {
    let params = current || {};
    if (!params.url && current.url) {
      params.url = current.url;
    }
    for (let prop of ["status", "statusText", "headers", "body", "url", "type", "redirected"]) {
      if (typeof res[prop] == "function") {
        res[prop](params[prop], params);
      } else if (typeof res[prop] != "undefined") {
        if (prop == "url") {
          params.url = new URL(res.url, params.url || "https://localhost/");
        } else {
          params[prop] = res[prop];
        }
      }
    }
    return params;
  }
  function response(...options) {
    let responseParams = {};
    for (let option of options) {
      if (typeof option == "string") {
        responseParams.body = option;
      } else if (option instanceof Response) {
        Object.assign(responseParams, getResponseParams(option, responseParams));
      } else if (option && typeof option == "object") {
        if (option instanceof FormData || option instanceof Blob || option instanceof ArrayBuffer || option instanceof DataView || option instanceof ReadableStream || option instanceof URLSearchParams || option instanceof String || typeof TypedArray != "undefined" && option instanceof TypedArray) {
          responseParams.body = option;
        } else {
          Object.assign(responseParams, getResponseParams(option, responseParams));
        }
      }
    }
    let r = new Response(responseParams.body, responseParams);
    Object.freeze(r);
    return new Proxy(r, {
      get(target, prop, receiver) {
        switch (prop) {
          case Symbol.metroProxy:
            return true;
            break;
          case Symbol.metroSource:
            return target;
            break;
          case "with":
            return function(...options2) {
              return response(target, ...options2);
            };
            break;
          case "body":
            if (responseParams.body) {
              if (responseParams.body[Symbol.metroProxy]) {
                return responseParams.body;
              }
              return bodyProxy(responseParams.body, target);
            } else {
              return bodyProxy("", target);
            }
            break;
          case "ok":
            return target.status >= 200 && target.status < 400;
            break;
          case "headers":
            return target.headers;
            break;
          default:
            if (prop in responseParams && prop != "toString") {
              return responseParams[prop];
            }
            if (prop in target && prop != "toString") {
              if (typeof target[prop] == "function") {
                return function(...args) {
                  return target[prop].apply(target, args);
                };
              }
              return target[prop];
            }
            break;
        }
        return void 0;
      }
    });
  }
  function appendSearchParams(url2, params) {
    if (typeof params == "function") {
      params(url2.searchParams, url2);
    } else {
      params = new URLSearchParams(params);
      params.forEach((value, key) => {
        url2.searchParams.append(key, value);
      });
    }
  }
  function url(...options) {
    let validParams = [
      "hash",
      "host",
      "hostname",
      "href",
      "password",
      "pathname",
      "port",
      "protocol",
      "username",
      "search",
      "searchParams"
    ];
    let u = new URL("https://localhost/");
    for (let option of options) {
      if (typeof option == "string" || option instanceof String) {
        u = new URL(option, u);
      } else if (option instanceof URL || typeof Location != "undefined" && option instanceof Location) {
        u = new URL(option);
      } else if (option instanceof URLSearchParams) {
        appendSearchParams(u, option);
      } else if (option && typeof option == "object") {
        for (let param in option) {
          if (param == "search") {
            if (typeof option.search == "function") {
              option.search(u.search, u);
            } else {
              u.search = new URLSearchParams(option.search);
            }
          } else if (param == "searchParams") {
            appendSearchParams(u, option.searchParams);
          } else {
            if (!validParams.includes(param)) {
              throw metroError("metro.url: unknown url parameter " + metroURL + "url/unknown-param-name/", param);
            }
            if (typeof option[param] == "function") {
              option[param](u[param], u);
            } else if (typeof option[param] == "string" || option[param] instanceof String || typeof option[param] == "number" || option[param] instanceof Number || typeof option[param] == "boolean" || option[param] instanceof Boolean) {
              u[param] = "" + option[param];
            } else if (typeof option[param] == "object" && option[param].toString) {
              u[param] = option[param].toString();
            } else {
              throw metroError("metro.url: unsupported value for " + param + " " + metroURL + "url/unsupported-param-value/", options[param]);
            }
          }
        }
      } else {
        throw metroError("metro.url: unsupported option value " + metroURL + "url/unsupported-option-value/", option);
      }
    }
    Object.freeze(u);
    return new Proxy(u, {
      get(target, prop, receiver) {
        switch (prop) {
          case Symbol.metroProxy:
            return true;
            break;
          case Symbol.metroSource:
            return target;
            break;
          case "with":
            return function(...options2) {
              return url(target, ...options2);
            };
            break;
        }
        if (target[prop] instanceof Function) {
          return target[prop].bind(target);
        }
        return target[prop];
      }
    });
  }
  function formdata(...options) {
    var params = new FormData();
    for (let option of options) {
      if (option instanceof FormData) {
        for (let entry of option.entries()) {
          params.append(entry[0], entry[1]);
        }
      } else if (option && typeof option == "object") {
        for (let entry of Object.entries(option)) {
          if (Array.isArray(entry[1])) {
            for (let value of entry[1]) {
              params.append(entry[0], value);
            }
          } else {
            params.append(entry[0], entry[1]);
          }
        }
      } else {
        throw new metroError("metro.formdata: unknown option type, only FormData or Object supported", option);
      }
    }
    Object.freeze(params);
    return new Proxy(params, {
      get: (target, prop, receiver) => {
        switch (prop) {
          case Symbol.metroProxy:
            return true;
            break;
          case Symbol.metroSource:
            return target;
            break;
          case "with":
            return function(...options2) {
              return formdata(target, ...options2);
            };
            break;
        }
        if (target[prop] instanceof Function) {
          return target[prop].bind(target);
        }
        return target[prop];
      }
    });
  }
  var metroConsole = {
    error: (message, ...details) => {
      console.error("\u24C2\uFE0F  ", message, ...details);
    },
    info: (message, ...details) => {
      console.info("\u24C2\uFE0F  ", message, ...details);
    },
    group: (name) => {
      console.group("\u24C2\uFE0F  " + name);
    },
    groupEnd: (name) => {
      console.groupEnd("\u24C2\uFE0F  " + name);
    }
  };
  function metroError(message, ...details) {
    metroConsole.error(message, ...details);
    return new Error(message, ...details);
  }
  var trace = {
    /**
     * Adds a named tracer function
     * @param {string} name - the name of the tracer
     * @param {Function} tracer - the tracer function to call
     */
    add(name, tracer) {
      Client.tracers[name] = tracer;
    },
    /**
     * Removes a named tracer function
     * @param {string} name
     */
    delete(name) {
      delete Client.tracers[name];
    },
    /**
     * Removes all tracer functions
     */
    clear() {
      Client.tracers = {};
    },
    /**
     * Returns a set of request and response tracer functions that use the
     * console.group feature to shows nested request/response pairs, with
     * most commonly needed information for debugging
     */
    group() {
      let group = 0;
      return {
        request: (req, middleware) => {
          group++;
          metroConsole.group(group);
          metroConsole.info(req?.url, req, middleware);
        },
        response: (res, middleware) => {
          metroConsole.info(res?.body ? res.body[Symbol.metroSource] : null, res, middleware);
          metroConsole.groupEnd(group);
          group--;
        }
      };
    }
  };

  // src/browser.mjs
  globalThis.metro = metro_exports;
  var browser_default = metro_exports;
})();
//# sourceMappingURL=browser.js.map
