const { initPugMgr, scanPugFolder, updateFile } = require('./pugFolderMgr');
const fs = require('fs');
const chokidar = require('chokidar');

var BASE_PATH = null;
var DEST_PATH = null;
var COMPILE_SETTING = null;
var WATCH = true;

/**
 * 當檔案有異動時，要啟動更新
 */
activeFileWatcher = (expr) => {
  var watcher = chokidar.watch(BASE_PATH, {
    ignored: /^\./,
    persistent: true,
  });

  let ready = false;
  watcher
    .on('ready', function () {
      ready = true;
    })
    .on('change', async (filePath) => {
      if (ready) {
        let relativePath = filePath.replace(BASE_PATH, '');
        let isMatch = relativePath.match(expr);
        console.log(
          `File ${relativePath} has been changed, matched:${isMatch}`
        );

        if (isMatch) {
          if (!(await updateFile(relativePath))) {
            //沒有include的就直接抄過去就好
            console.log(`File ${relativePath} without include, do file copy`);
            fs.copyFileSync(filePath, DEST_PATH + relativePath);
          }
        }
      }
    });
};

/**
 * 決定那些目錄要同步 , 如果目錄是空的就預設是全部
 */
getWatchPugSubFolderExpr = () => {
  const webpackcfg = COMPILE_SETTING;
  console.log(webpackcfg.compiler);

  let expr = '^(/_';
  webpackcfg.compiler.folder.forEach((item) => {
    expr += `|/${item}`;
  });
  let exprObj =
    webpackcfg.compiler.folder.length == 0 ? /.*/ : new RegExp(expr + ')+.*');

  console.log(`EXPR: ${exprObj}`);
  return exprObj;
};

run1 = async () => {
  let expr = getWatchPugSubFolderExpr();
  //掃描所有檔案
  await scanPugFolder(expr);

  //啟動檔案異動監控, 如果是純建置就不做監控了
  if (WATCH) {
    activeFileWatcher(expr);
  }
};

startBuild = async (src, dest, pugCompileSetting, watch) => {
  BASE_PATH = src;
  DEST_PATH = dest;
  COMPILE_SETTING = pugCompileSetting;
  WATCH = watch;
  initPugMgr(BASE_PATH, DEST_PATH);
  await run1();
};

module.exports = { startBuild };
