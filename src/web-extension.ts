"use strict";

import * as vscode from "vscode";
import { ServerManagerView } from "./ui/serverManagerView";
import { commonActivate } from "./commonActivate";

export function activate(context: vscode.ExtensionContext) {
    const view = new ServerManagerView(context);

    // Common activation steps
    return commonActivate(context, view);
}

export function deactivate() { }
