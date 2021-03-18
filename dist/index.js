"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const loader_utils_1 = require("loader-utils");
const twing_1 = require("twing");
const visitor_1 = require("./visitor");
const sha256 = require('crypto-js/sha256');
const hex = require('crypto-js/enc-hex');
const slash = require('slash');
const validateOptions = require('schema-utils');
const optionsSchema = {
    type: 'object',
    properties: {
        environmentModulePath: {
            type: 'string'
        },
        renderContext: {
            type: 'object'
        }
    },
    required: [
        'environmentModulePath'
    ],
    additionalProperties: false
};
class PathSupportingArrayLoader extends twing_1.TwingLoaderArray {
    getSourceContext(name, from) {
        return super.getSourceContext(name, from).then((source) => {
            return new twing_1.TwingSource(source.getCode(), source.getName(), name);
        });
    }
}
async function default_1(source) {
    const callback = this.async();
    const getTemplateHash = (name) => {
        return this.mode !== 'production' ? name : hex.stringify(sha256(name));
    };
    const options = loader_utils_1.getOptions(this);
    validateOptions(optionsSchema, options, 'Twing loader');
    let resourcePath = slash(this.resourcePath);
    let environmentModulePath = options.environmentModulePath;
    let renderContext = options.renderContext;
    this.addDependency(slash(environmentModulePath));
    // require takes module name separated with forward slashes
    let environment = require(slash(environmentModulePath));
    let loader = environment.getLoader();
    if (renderContext === undefined) {
        let parts = [
            `const env = require('${slash(environmentModulePath)}');`
        ];
        let key = getTemplateHash(resourcePath);
        let sourceContext = new twing_1.TwingSource(source, `${key}`);
        let tokenStream;
        let nodeModule;
        try {
            tokenStream = environment.tokenize(sourceContext);
            nodeModule = environment.parse(tokenStream);
        }
        catch (err) {
            callback(err);
            return null;
        }
        let visitor = new visitor_1.Visitor(loader, resourcePath, getTemplateHash);
        await visitor.visit(nodeModule);
        let precompiledTemplate = environment.compile(nodeModule);
        parts.push(`let templatesModule = (() => {
let module = {
    exports: undefined
};

${precompiledTemplate}

    return module.exports;
})();
`);
        for (let foundTemplateName of visitor.foundTemplateNames) {
            // require takes module name separated with forward slashes
            parts.push(`require('${slash(foundTemplateName)}');`);
        }
        parts.push(`env.registerTemplatesModule(templatesModule, '${key}');`);
        parts.push(`
let loadTemplate = () => env.loadTemplate('${key}');

module.exports = (context = {}) => {
    return loadTemplate().then((template) => template.render(context));
};`);
        callback(null, parts.join('\n'));
    }
    else {
        environment.setLoader(new twing_1.TwingLoaderChain([
            new PathSupportingArrayLoader(new Map([
                [resourcePath, source]
            ])),
            loader
        ]));
        environment.on('template', (name, from) => {
            environment.getLoader().resolve(name, from)
                .then((path) => this.addDependency(path))
                .catch((e) => { });
        });
        callback(null, `module.exports = ${JSON.stringify(await environment.render(resourcePath, renderContext))};`);
    }
}
exports.default = default_1;
;
