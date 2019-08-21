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
        parser: "typescript",
        trailingComma: "all"
    });
}
exports.formatCode = formatCode;
function handleConfig(config, env) {
    if (env !== "prod") {
        return config;
    }
    const keys = ["entities", "migrations", "subscribers"];
    for (const key of keys) {
        if (config[key]) {
            const newValue = config[key].map((item) => item.replace(/\.ts$/, ".js"));
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
    const filename = file.split(path_1.sep).pop() || "";
    const name = capitalizeFirstLetter(filename.replace(/\.ts$|\.js$/g, ""));
    return name;
}
function writeTyping(path, text) {
    fs.writeFileSync(path, formatCode(text), { encoding: "utf8" });
}
function getTypingText(importText, repoText, entityText, customRepo) {
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
    customRepo: {
      ${customRepo}
    }
  }
}
`;
    return tpl;
}
function formatPaths(files) {
    return files.map(file => {
        const name = getModelName(file);
        file = file.split(path_1.sep).join("/");
        const importPath = `../${file}`.replace(/\.ts$|\.js$/g, "");
        return {
            name,
            importPath
        };
    });
}
function watchEntity(app) {
    const { baseDir } = app;
    const entityDir = path_1.join(baseDir, "app", "entity");
    const typingsDir = path_1.join(baseDir, "typings");
    if (!fs.existsSync(entityDir))
        return;
    fs.ensureDirSync(typingsDir);
    chokidar_1.watch(entityDir).on("all", (eventType) => {
        if (["add", "change"].includes(eventType)) {
            createTyingFile(app);
        }
        if (["unlink"].includes(eventType)) {
            createTyingFile(app);
        }
    });
}
function watchCustomRepo(app) {
    const { baseDir } = app;
    const entityDir = path_1.join(baseDir, "app", "customRepo");
    const typingsDir = path_1.join(baseDir, "typings");
    if (!fs.existsSync(entityDir))
        return;
    fs.ensureDirSync(typingsDir);
    chokidar_1.watch(entityDir).on("all", (eventType) => {
        if (["add", "change"].includes(eventType)) {
            createTyingFile(app);
        }
        if (["unlink"].includes(eventType)) {
            createTyingFile(app);
        }
    });
}
function createTyingFile(app) {
    const { baseDir } = app;
    const entityDir = path_1.join(baseDir, "app", "entity");
    const files = fs_jetpack_1.find(entityDir, { matching: "*.ts" });
    const customRepoDir = path_1.join(baseDir, "app", "customRepo");
    const customRepoFiles = fs_jetpack_1.find(customRepoDir, { matching: "*.ts" });
    const typingPath = path_1.join(baseDir, "typings", "typeorm.d.ts");
    const pathArr = formatPaths(files);
    const importText = pathArr
        .map(i => `import ${i.name} from '${i.importPath}'`)
        .join("\n");
    const repoText = pathArr
        .map(i => `${i.name}: Repository<${i.name}>`)
        .join("\n");
    const customRepoText = formatPaths(customRepoFiles)
        .map(i => `${i.name}: Repository<${i.name}>`)
        .join("\n");
    // TODO
    const entityText = pathArr.map(i => `${i.name}: any`).join("\n");
    const text = getTypingText(importText, repoText, entityText, customRepoText);
    writeTyping(typingPath, text);
}
async function loadEntityAndModel(app) {
    const { baseDir } = app;
    const entityDir = path_1.join(baseDir, "app", "entity");
    if (!fs.existsSync(entityDir))
        return;
    const matching = ["unittest", "local"].includes(app.config.env)
        ? "*.ts"
        : "*.js";
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
async function loadCustomRepo(app) {
    const { baseDir } = app;
    const entityDir = path_1.join(baseDir, "app", "customRepo");
    if (!fs.existsSync(entityDir))
        return;
    const matching = ["unittest", "local"].includes(app.config.env)
        ? "*.ts"
        : "*.js";
    const files = fs_jetpack_1.find(entityDir, { matching });
    app.context.customRepo = {};
    try {
        for (const file of files) {
            const entityPath = path_1.join(baseDir, file);
            const requiredModule = require(entityPath);
            const name = getModelName(file);
            const entity = requiredModule.default || requiredModule[name];
            app.context.customRepo[name] = typeorm_1.getCustomRepository(entity);
        }
    }
    catch (e) {
        console.log(e);
    }
}
exports.default = async (app) => {
    const config = app.config.typeorm;
    if (!config) {
        throw new Error("please config typeorm in config file");
    }
    app.beforeStart(async () => {
        try {
            await connectDB(app);
            // if (app.config.env === 'local') {
            watchEntity(app);
            watchCustomRepo(app);
            // }
            await loadEntityAndModel(app);
            await loadCustomRepo(app);
            app.logger.info("[typeorm]", "数据链接成功");
        }
        catch (error) {
            app.logger.error("[typeorm]", "数据库链接失败");
            app.logger.error(error);
        }
    });
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLCtCQUFpQztBQUNqQywyQ0FBa0M7QUFFbEMscUNBQStFO0FBQy9FLHVDQUFpQztBQUNqQyxxREFBK0I7QUFDL0IsMkRBQXFDO0FBRXJDLFNBQWdCLFVBQVUsQ0FBQyxJQUFZO0lBQ3JDLE9BQU8sUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUU7UUFDM0IsSUFBSSxFQUFFLEtBQUs7UUFDWCxRQUFRLEVBQUUsQ0FBQztRQUNYLFdBQVcsRUFBRSxJQUFJO1FBQ2pCLE1BQU0sRUFBRSxZQUFZO1FBQ3BCLGFBQWEsRUFBRSxLQUFLO0tBQ3JCLENBQUMsQ0FBQztBQUNMLENBQUM7QUFSRCxnQ0FRQztBQUVELFNBQVMsWUFBWSxDQUFDLE1BQVcsRUFBRSxHQUFXO0lBQzVDLElBQUksR0FBRyxLQUFLLE1BQU0sRUFBRTtRQUNsQixPQUFPLE1BQU0sQ0FBQztLQUNmO0lBQ0QsTUFBTSxJQUFJLEdBQUcsQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQ3ZELEtBQUssTUFBTSxHQUFHLElBQUksSUFBSSxFQUFFO1FBQ3RCLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ2YsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQVksRUFBRSxFQUFFLENBQ2hELElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUM3QixDQUFDO1lBQ0YsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLFFBQVEsQ0FBQztTQUN4QjtLQUNGO0lBQ0QsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQztBQUVELEtBQUssVUFBVSxTQUFTLENBQUMsR0FBZ0I7SUFDdkMsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEUsTUFBTSxVQUFVLEdBQUcsTUFBTSwwQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNsRCxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7QUFDdEMsQ0FBQztBQUVELFNBQVMscUJBQXFCLENBQUMsR0FBVztJQUN4QyxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwRCxDQUFDO0FBRUQsU0FBUyxZQUFZLENBQUMsSUFBWTtJQUNoQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUM3QyxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3pFLE9BQU8sSUFBSSxDQUFDO0FBQ2QsQ0FBQztBQUVELFNBQVMsV0FBVyxDQUFDLElBQVksRUFBRSxJQUFZO0lBQzdDLEVBQUUsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQ2pFLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FDcEIsVUFBa0IsRUFDbEIsUUFBZ0IsRUFDaEIsVUFBa0IsRUFDbEIsVUFBa0I7SUFFbEIsTUFBTSxHQUFHLEdBQUc7OztFQUdaLFVBQVU7Ozs7OztRQU1KLFVBQVU7OztRQUdWLFFBQVE7OztRQUdSLFVBQVU7Ozs7Q0FJakIsQ0FBQztJQUNBLE9BQU8sR0FBRyxDQUFDO0FBQ2IsQ0FBQztBQUVELFNBQVMsV0FBVyxDQUFDLEtBQWU7SUFDbEMsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ3RCLE1BQU0sSUFBSSxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDakMsTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFJLEVBQUUsQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVELE9BQU87WUFDTCxJQUFJO1lBQ0osVUFBVTtTQUNYLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxTQUFTLFdBQVcsQ0FBQyxHQUFnQjtJQUNuQyxNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsR0FBRyxDQUFDO0lBQ3hCLE1BQU0sU0FBUyxHQUFHLFdBQUksQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ2pELE1BQU0sVUFBVSxHQUFHLFdBQUksQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFFNUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDO1FBQUUsT0FBTztJQUV0QyxFQUFFLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzdCLGdCQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLFNBQWlCLEVBQUUsRUFBRTtRQUMvQyxJQUFJLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRTtZQUN6QyxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDdEI7UUFFRCxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFO1lBQ2xDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUN0QjtJQUNILENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVELFNBQVMsZUFBZSxDQUFDLEdBQWdCO0lBQ3ZDLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxHQUFHLENBQUM7SUFDeEIsTUFBTSxTQUFTLEdBQUcsV0FBSSxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDckQsTUFBTSxVQUFVLEdBQUcsV0FBSSxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztJQUU1QyxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUM7UUFBRSxPQUFPO0lBRXRDLEVBQUUsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDN0IsZ0JBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUMsU0FBaUIsRUFBRSxFQUFFO1FBQy9DLElBQUksQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFO1lBQ3pDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUN0QjtRQUVELElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDbEMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ3RCO0lBQ0gsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsR0FBZ0I7SUFDdkMsTUFBTSxFQUFFLE9BQU8sRUFBRSxHQUFHLEdBQUcsQ0FBQztJQUN4QixNQUFNLFNBQVMsR0FBRyxXQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNqRCxNQUFNLEtBQUssR0FBRyxpQkFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBRXBELE1BQU0sYUFBYSxHQUFHLFdBQUksQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ3pELE1BQU0sZUFBZSxHQUFHLGlCQUFJLENBQUMsYUFBYSxFQUFFLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFFbEUsTUFBTSxVQUFVLEdBQUcsV0FBSSxDQUFDLE9BQU8sRUFBRSxTQUFTLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDNUQsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ25DLE1BQU0sVUFBVSxHQUFHLE9BQU87U0FDdkIsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxVQUFVLEdBQUcsQ0FBQztTQUNuRCxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDZCxNQUFNLFFBQVEsR0FBRyxPQUFPO1NBQ3JCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQztTQUM1QyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFZCxNQUFNLGNBQWMsR0FBRyxXQUFXLENBQUMsZUFBZSxDQUFDO1NBQ2hELEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQztTQUM1QyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFZCxPQUFPO0lBQ1AsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2pFLE1BQU0sSUFBSSxHQUFHLGFBQWEsQ0FBQyxVQUFVLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUM3RSxXQUFXLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ2hDLENBQUM7QUFFRCxLQUFLLFVBQVUsa0JBQWtCLENBQUMsR0FBZ0I7SUFDaEQsTUFBTSxFQUFFLE9BQU8sRUFBRSxHQUFHLEdBQUcsQ0FBQztJQUN4QixNQUFNLFNBQVMsR0FBRyxXQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztJQUVqRCxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUM7UUFBRSxPQUFPO0lBRXRDLE1BQU0sUUFBUSxHQUFHLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUM3RCxDQUFDLENBQUMsTUFBTTtRQUNSLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFFWCxNQUFNLEtBQUssR0FBRyxpQkFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDNUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBQ3RCLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUV4QixJQUFJO1FBQ0YsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUU7WUFDeEIsTUFBTSxVQUFVLEdBQUcsV0FBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN2QyxNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDM0MsTUFBTSxJQUFJLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hDLE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxPQUFPLElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRTlELEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLHVCQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDL0MsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDO1NBQ25DO0tBQ0Y7SUFBQyxPQUFPLENBQUMsRUFBRTtRQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDaEI7QUFDSCxDQUFDO0FBRUQsS0FBSyxVQUFVLGNBQWMsQ0FBQyxHQUFnQjtJQUM1QyxNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsR0FBRyxDQUFDO0lBQ3hCLE1BQU0sU0FBUyxHQUFHLFdBQUksQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBRXJELElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQztRQUFFLE9BQU87SUFFdEMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDO1FBQzdELENBQUMsQ0FBQyxNQUFNO1FBQ1IsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUVYLE1BQU0sS0FBSyxHQUFHLGlCQUFJLENBQUMsU0FBUyxFQUFFLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUM1QyxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7SUFFNUIsSUFBSTtRQUNGLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFO1lBQ3hCLE1BQU0sVUFBVSxHQUFHLFdBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDdkMsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzNDLE1BQU0sSUFBSSxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsT0FBTyxJQUFJLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUU5RCxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyw2QkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUM1RDtLQUNGO0lBQUMsT0FBTyxDQUFDLEVBQUU7UUFDVixPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ2hCO0FBQ0gsQ0FBQztBQUVELGtCQUFlLEtBQUssRUFBRSxHQUFnQixFQUFFLEVBQUU7SUFDeEMsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUM7SUFDbEMsSUFBSSxDQUFDLE1BQU0sRUFBRTtRQUNYLE1BQU0sSUFBSSxLQUFLLENBQUMsc0NBQXNDLENBQUMsQ0FBQztLQUN6RDtJQUVELEdBQUcsQ0FBQyxXQUFXLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFDekIsSUFBSTtZQUNGLE1BQU0sU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3JCLG9DQUFvQztZQUNwQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDakIsZUFBZSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3JCLElBQUk7WUFDSixNQUFNLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzlCLE1BQU0sY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzFCLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxRQUFRLENBQUMsQ0FBQztTQUN4QztRQUFDLE9BQU8sS0FBSyxFQUFFO1lBQ2QsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3pDLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQ3pCO0lBQ0gsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMifQ==