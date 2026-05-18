export interface PluginMessage {
    type: string;
    command?: string;
    params?: any;
    id?: string;
    link?: string;
    scopeNodeId?: string;
    message?: string;
}

export interface ParameterPayload {
    [key: string]: any;
}
