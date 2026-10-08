type BOOL = boolean | 0 | 1;

export interface Env {
    appname: string,
    appid: string,
    adunit: string,
    version: string,
    gm?: BOOL,
    debug?: BOOL,
    log: {
        loom: BOOL;
    };
    [key: string]: any;
}

declare global {
    const $env: Readonly<Env>;
    const DEBUG: boolean;
}
