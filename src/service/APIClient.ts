import { z } from "zod";

export class APIClient {
    private readonly baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    async post<S extends z.ZodType>(
        endpoint: string,
        schema: S,
        body: any = {},
        throwOnErr: boolean = true,
        options: RequestInit = {}
    ) : Promise<z.infer<S>> {
        return await this._fetch("POST", endpoint, schema, body, throwOnErr, options);
    }

    async _fetch<S extends z.ZodType>(
        method: string,
        endpoint: string,
        schema: S,
        body: any = {},
        throwOnErr: boolean = true,
        options: RequestInit = {}
    ) : Promise<z.infer<S>> {
        const url = `${this.baseUrl}${endpoint}`;
        const res = await fetch(url, {
            method,
            body: JSON.stringify(body),
            ...options,
        });
        const raw = await res.json();
        if (!res.ok && throwOnErr) {
            throw new Error(`API error at ${endpoint}: ${res.status}\n\n${res.statusText}`);
        }
        const parsedObj = schema.parse(raw);
        return parsedObj;
    }
}


