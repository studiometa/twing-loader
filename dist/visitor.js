"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Visitor = void 0;
const twing_1 = require("twing");
const fs_1 = require("fs");
const slash = require('slash');
class Visitor {
    constructor(loader, from, getTemplateHash) {
        this._loader = loader;
        this._from = new twing_1.TwingSource('', from, from);
        this._getTemplateHash = getTemplateHash;
        this._foundTemplateNames = [];
    }
    get foundTemplateNames() {
        return this._foundTemplateNames;
    }
    async visit(node) {
        const processExpressionNode = async (node) => {
            if (node.type === null) {
                return;
            }
            const pushValue = async (value) => {
                if (await this._loader.exists(value, this._from)) {
                    value = await this._loader.resolve(value, this._from);
                    if (fs_1.existsSync(value)) {
                        if (!this._foundTemplateNames.includes(value)) {
                            this._foundTemplateNames.push(value);
                        }
                        value = this._getTemplateHash(slash(value));
                    }
                }
                return value;
            };
            if (node.type.toString() === 'expression_array') {
                for (let [index, constantNode] of node.getNodes()) {
                    if (index % 2) {
                        await processExpressionNode(constantNode);
                    }
                }
            }
            if (node.type.toString() === 'expression_conditional') {
                let expr2 = node.getNode('expr2');
                let expr3 = node.getNode('expr3');
                await processExpressionNode(expr2);
                await processExpressionNode(expr3);
            }
            if (node.type.toString() === 'expression_constant') {
                node.setAttribute('value', await pushValue(node.getAttribute('value')));
            }
        };
        if (node.type !== null) {
            // include function
            if ((node.type.toString() === 'expression_function') && (node.getAttribute('name') === 'include')) {
                await processExpressionNode(node.getNode('arguments').getNode(0));
            }
            // import and include tags
            if ((node.type.toString() === 'import') || (node.type.toString() === 'include')) {
                if (node.hasNode('expr')) {
                    await processExpressionNode(node.getNode('expr'));
                }
            }
            // extends and embed tags
            if ((node.type.toString() === 'module')) {
                if (node.hasNode('parent')) {
                    await processExpressionNode(node.getNode('parent'));
                }
                for (let embeddedTemplate of node.getAttribute('embedded_templates')) {
                    await this.visit(embeddedTemplate);
                }
            }
        }
        for (let [key, subNode] of node.getNodes()) {
            await this.visit(subNode);
        }
    }
    ;
}
exports.Visitor = Visitor;
