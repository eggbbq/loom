export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";

export type HttpOptions = {
    headers?: Record<string, string>;
    responseType?: XMLHttpRequestResponseType;
    contentType?: string;
    timeout?: number;
};

export type HttpResponse<T = any> = {
    status: number;
    ok: boolean;
    url: string;
    headers: Record<string, string>;
    data: T;
    raw: XMLHttpRequest;
};

export class HttpError<T = any> extends Error {
    response?: HttpResponse<T>;

    constructor(message: string, response?: HttpResponse<T>) {
        super(message);
        this.name = "HttpError";
        this.response = response;
    }
}


/**
 * 这只是一个简单的restful工具类，用于简化http请求
 * 千万不要用它来实现复杂的网络逻辑，比如游戏网络模块
 */
export class Http {
    static get<T = any>(url: string, options?: HttpOptions): Promise<HttpResponse<T>> {
        return this.request<T>("GET", url, undefined, options);
    }

    static post<T = any>(url: string, data?: any, options?: HttpOptions): Promise<HttpResponse<T>> {
        return this.request<T>("POST", url, data, options);
    }

    static put<T = any>(url: string, data?: any, options?: HttpOptions): Promise<HttpResponse<T>> {
        return this.request<T>("PUT", url, data, options);
    }

    static patch<T = any>(url: string, data?: any, options?: HttpOptions): Promise<HttpResponse<T>> {
        return this.request<T>("PATCH", url, data, options);
    }

    static delete<T = any>(url: string, options?: HttpOptions): Promise<HttpResponse<T>> {
        return this.request<T>("DELETE", url, undefined, options);
    }

    static head(url: string, options?: HttpOptions): Promise<HttpResponse<string>> {
        return this.request<string>("HEAD", url, undefined, options);
    }

    static request<T = any>(
        method: HttpMethod,
        url: string,
        data?: any,
        options?: HttpOptions
    ): Promise<HttpResponse<T>> {
        const http = new XMLHttpRequest();
        const body = this.createBody(data, options);

        return new Promise<HttpResponse<T>>((resolve, reject) => {
            try {
                http.open(method, url, true);
                http.responseType = options?.responseType || "text";
                if (options?.timeout) http.timeout = options.timeout;

                const headers = options?.headers || {};
                const headerContentType = this.getHeader(headers, "content-type");
                const contentType = headerContentType || options?.contentType;
                if (body !== undefined && contentType) {
                    http.setRequestHeader("Content-Type", contentType);
                } else if (body !== undefined && this.shouldUseJson(data)) {
                    http.setRequestHeader("Content-Type", "application/json");
                }

                for (const [key, value] of Object.entries(headers)) {
                    if (key.toLowerCase() === "content-type") continue;
                    http.setRequestHeader(key, value);
                }

                http.onload = () => {
                    try {
                        const response = this.createResponse<T>(http, url);
                        if (response.ok) {
                            resolve(response);
                        } else {
                            reject(new HttpError(`HTTP ${response.status}`, response));
                        }
                    } catch (error) {
                        reject(error);
                    }
                };
                http.onerror = () => reject(new HttpError("Network error"));
                http.onabort = () => reject(new HttpError("Request aborted"));
                http.ontimeout = () => reject(new HttpError("Request timeout"));
                http.send(body);
            } catch (error) {
                reject(error);
            }
        });
    }

    static parseHeaders(headerString: string): Record<string, string> {
        const headers: Record<string, string> = {};
        if (!headerString) return headers;

        for (const line of headerString.split("\r\n")) {
            const index = line.indexOf(":");
            if (index === -1) continue;
            const key = line.slice(0, index).trim().toLowerCase();
            const value = line.slice(index + 1).trim();
            if (key) headers[key] = value;
        }
        return headers;
    }

    private static createBody(data: any, options?: HttpOptions): string | Document | XMLHttpRequestBodyInit | undefined {
        if (data === undefined || data === null) return undefined;
        const headers = options?.headers || {};
        const contentType = this.getHeader(headers, "content-type") || options?.contentType;
        if (this.shouldUseJson(data) && (!contentType || contentType.toLowerCase().indexOf("json") !== -1)) {
            return JSON.stringify(data);
        }
        return data;
    }

    private static createResponse<T>(http: XMLHttpRequest, url: string): HttpResponse<T> {
        const headers = this.parseHeaders(http.getAllResponseHeaders());
        return {
            status: http.status,
            ok: http.status >= 200 && http.status < 300,
            url: http.responseURL || url,
            headers,
            data: this.parseData<T>(http, headers),
            raw: http,
        };
    }

    private static parseData<T>(http: XMLHttpRequest, headers: Record<string, string>): T {
        if (http.responseType && http.responseType !== "text") {
            return http.response as T;
        }

        const text = http.responseText;
        if (!text) return undefined as T;
        const contentType = headers["content-type"] || "";
        if (contentType.indexOf("json") !== -1) {
            return JSON.parse(text) as T;
        }

        try {
            return JSON.parse(text) as T;
        } catch {
            return text as T;
        }
    }

    private static shouldUseJson(data: any): boolean {
        if (typeof data !== "object") return false;
        if (data instanceof FormData) return false;
        if (data instanceof Blob) return false;
        if (data instanceof ArrayBuffer) return false;
        if (data instanceof URLSearchParams) return false;
        return true;
    }

    private static getHeader(headers: Record<string, string>, name: string): string {
        const lowerName = name.toLowerCase();
        for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === lowerName) return headers[key];
        }
        return "";
    }
}
