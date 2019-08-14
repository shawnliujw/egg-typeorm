"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const path_1 = require("path");
const fs_jetpack_1 = require("fs-jetpack");
const typeorm_1 = require("typeorm");
const chokidar_1 = require("chokidar");
const fs = tslib_1.__importStar(require("fs-extra"));
const prettier = tslib_1.__importStar(require("prettier"));
function formatCode(text) {
    return prettier.format(text, {
        semi: false,
        tabWidth: 2,
        singleQuote: true,
        parser: 'typescript',
        trailingComma: 'all',
    });
}
exports.formatCode = formatCode;
function handleConfig(config, env) {
    if (env !== 'prod') {
        return config;
    }
    const keys = ['entities', 'migrations', 'subscribers'];
    for (const key of keys) {
        if (config[key]) {
            const newValue = config[key].map((item) => item.replace(/\.ts$/, '.js'));
            config[key] = newValue;
        }
    }
    return config;
}
async function connectDB(app) {
    const config = handleConfig(app.config.typeorm, app.config.env);
    const connection = await typeorm_1.createConnection(config);
    app.context.connection = connection;
}
function capitalizeFirstLetter(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
function getModelName(file) {
    const filename = file.split(path_1.sep).pop() || '';
    const name = capitalizeFirstLetter(filename.replace(/\.ts$|\.js$/g, ''));
    return name;
}
function writeTyping(path, text) {
    fs.writeFileSync(path, formatCode(text), { encoding: 'utf8' });
}
function getTypingText(importText, repoText, entityText) {
    const tpl = `
import 'egg'
import { Repository, Connection } from 'typeorm'
${importText}

declare module 'egg' {
  interface Context {
    connection: Connection
    entity: {
      ${entityText}
    }
    repo: {
      ${repoText}
    }
  }
}
`;
    return tpl;
}
function formatPaths(files) {
    return files.map(file => {
        const name = getModelName(file);
        file = file.split(path_1.sep).join('/');
        const importPath = `../${file}`.replace(/\.ts$|\.js$/g, '');
        return {
            name,
            importPath,
        };
    });
}
function watchEntity(app) {
    const { baseDir } = app;
    const entityDir = path_1.join(baseDir, 'app', 'entity');
    const typingsDir = path_1.join(baseDir, 'typings');
    if (!fs.existsSync(entityDir))
        return;
    fs.ensureDirSync(typingsDir);
    chokidar_1.watch(entityDir).on('all', (eventType) => {
        if (['add', 'change'].includes(eventType)) {
            createTyingFile(app);
        }
        if (['unlink'].includes(eventType)) {
            createTyingFile(app);
        }
    });
}
function createTyingFile(app) {
    const { baseDir } = app;
    const entityDir = path_1.join(baseDir, 'app', 'entity');
    const files = fs_jetpack_1.find(entityDir, { matching: '*.ts' });
    const typingPath = path_1.join(baseDir, 'typings', 'typeorm.d.ts');
    const pathArr = formatPaths(files);
    const importText = pathArr
        .map(i => `import ${i.name} from '${i.importPath}'`)
        .join('\n');
    const repoText = pathArr
        .map(i => `${i.name}: Repository<${i.name}>`)
        .join('\n');
    // TODO
    const entityText = pathArr.map(i => `${i.name}: any`).join('\n');
    const text = getTypingText(importText, repoText, entityText);
    writeTyping(typingPath, text);
}
async function loadEntityAndModel(app) {
    const { baseDir } = app;
    const entityDir = path_1.join(baseDir, 'app', 'entity');
    if (!fs.existsSync(entityDir))
        return;
    const matching = ['unittest', 'local'].includes(app.config.env) ? '*.ts' : '*.js';
    const files = fs_jetpack_1.find(entityDir, { matching });
    app.context.repo = {};
    app.context.entity = {};
    try {
        for (const file of files) {
            const entityPath = path_1.join(baseDir, file);
            const requiredModule = require(entityPath);
            const name = getModelName(file);
            const entity = requiredModule.default || requiredModule[name];
            app.context.repo[name] = typeorm_1.getRepository(entity);
            app.context.entity[name] = entity;
        }
    }
    catch (e) {
        console.log(e);
    }
}
exports.default = async (app) => {
    const config = app.config.typeorm;
    if (!config) {
        throw new Error('please config typeorm in config file');
    }
    app.beforeStart(async () => {
        try {
            await connectDB(app);
            // if (app.config.env === 'local') {
            watchEntity(app);
            // }
            await loadEntityAndModel(app);
            app.logger.info('[typeorm]', '数据链接成功');
        }
        catch (error) {
            app.logger.error('[typeorm]', '数据库链接失败');
            app.logger.error(error);
        }
    });
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLCtCQUFnQztBQUNoQywyQ0FBaUM7QUFFakMscUNBQXlEO0FBQ3pELHVDQUFnQztBQUNoQyxxREFBOEI7QUFDOUIsMkRBQW9DO0FBRXBDLFNBQWdCLFVBQVUsQ0FBQyxJQUFZO0lBQ3JDLE9BQU8sUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUU7UUFDM0IsSUFBSSxFQUFFLEtBQUs7UUFDWCxRQUFRLEVBQUUsQ0FBQztRQUNYLFdBQVcsRUFBRSxJQUFJO1FBQ2pCLE1BQU0sRUFBRSxZQUFZO1FBQ3BCLGFBQWEsRUFBRSxLQUFLO0tBQ3JCLENBQUMsQ0FBQTtBQUNKLENBQUM7QUFSRCxnQ0FRQztBQUVELFNBQVMsWUFBWSxDQUFDLE1BQVcsRUFBRSxHQUFXO0lBQzVDLElBQUksR0FBRyxLQUFLLE1BQU0sRUFBRTtRQUNsQixPQUFPLE1BQU0sQ0FBQTtLQUNkO0lBQ0QsTUFBTSxJQUFJLEdBQUcsQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLGFBQWEsQ0FBQyxDQUFBO0lBQ3RELEtBQUssTUFBTSxHQUFHLElBQUksSUFBSSxFQUFFO1FBQ3RCLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ2YsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQVksRUFBRSxFQUFFLENBQ2hELElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUM3QixDQUFBO1lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLFFBQVEsQ0FBQTtTQUN2QjtLQUNGO0lBQ0QsT0FBTyxNQUFNLENBQUE7QUFDZixDQUFDO0FBRUQsS0FBSyxVQUFVLFNBQVMsQ0FBQyxHQUFnQjtJQUN2QyxNQUFNLE1BQU0sR0FBRyxZQUFZLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFP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