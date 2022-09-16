const fs = require('fs');
const path = require('path');
const { exit } = require('process');
const syncDirectory = require('sync-directory');
const rimraf = require('rimraf');

var BASE_PATH;
var DEST_PATH;
var pugMap = {};
var pugData = {};

refactorMap = () => {
  //add all child ref
  Object.keys(pugMap).forEach(function (key, index) {
    for (let idx = 0; idx < pugMap[key].includeAry.length; idx++) {
      let kxy = pugMap[key].includeAry[idx].refFile;
      if (pugMap[kxy]) {
        pugMap[kxy].child.push(pugMap[key]);
        //console.log(pugMap[key].includeAry[idx]);
      } else {
        console.log(`not found #${kxy}#`);
        exit(0);
      }
    }
  });

  //clean without child and include refs
  let newPugMap = {};
  Object.keys(pugMap).forEach(function (key, index) {
    if (pugMap[key].includeAry.length > 0 || pugMap[key].child.length > 0) {
      newPugMap[key] = pugMap[key];
    }
  });
  pugMap = newPugMap;
};

parseIncludeLine = (src, line, row) => {
  let lineData = line.match(/^(\s*)include\s+(.*)/);
  let fileRelativePath = lineData[2].replace(/\s*$/, '');
  if (fileRelativePath.match(/\.js\s*$/)) {
    return;
  } else if (!fileRelativePath.match(/\.pug\s*$/)) {
    fileRelativePath += '.pug';
  }

  return {
    refFile: path.resolve(path.dirname(src), fileRelativePath),
    ori: {
      file: src,
      line: line,
      row: row,
      space: lineData[1],
    },
  };
};

parsePugInclude = (src) => {
  let row = -1;
  pugData[src].forEach((line) => {
    row++;
    let matcher = line.match(/^(\s*)include\s+(.*)/);
    if (matcher) {
      let includeCfg = parseIncludeLine(src, line, row);
      if (includeCfg) {
        pugMap[src].includeAry.push(includeCfg);
      }
    }
  });
};

parsePugFile = async (src) => {
  let data = fs.readFileSync(src);

  //console.log(data.toString());
  let name = src.replace(BASE_PATH, '').replace(/\s*$/, '');
  pugMap[name] = {
    fullpath: src,
    child: pugMap[name] ? pugMap[name].child : [],
    includeAry: [],
  };
  pugData[name] = data.toString().split('\n');
  parsePugInclude(name);
};

scanFolder = async (src) => {
  let files = fs.readdirSync(path.resolve(src));
  files.forEach(async (fileName) => {
    let path0 = `${src}/${fileName}`;
    if (fs.lstatSync(path0).isDirectory()) {
      await scanFolder(path0);
    } else {
      await parsePugFile(path0);
    }
  });
};

getFinalFileData = (src, space) => {
  //console.log(`PROCESS FILE #${space}# ${src}`);
  let rtnData = [...pugData[src]];
  if (pugMap[src].includeAry) {
    pugMap[src].includeAry.forEach((item) => {
      rtnData[item.ori.row] =
        //"//REPLACE_INCLUDE " +
        //item.ori.line +
        item.ori.space + getFinalFileData(item.refFile, space + item.ori.space);
    });
  }

  return rtnData.join(`\n${space}`);
};

updateByFile = (src) => {
  if (!pugMap[src]) {
    return false;
  }
  console.log(`UPDATE FILE INCLUDE ${src} `);
  let rtnData = getFinalFileData(src, '');

  console.log(`UPDATE FILE TO ${DEST_PATH}${src}`);
  fs.mkdirSync(path.dirname(`${DEST_PATH}${src}`), { recursive: true });
  fs.writeFileSync(`${DEST_PATH}${src}`, rtnData);
  //console.log(pugData[src].join("\n"));

  pugMap[src].child.forEach((child) => {
    updateByFile(child.fullpath.replace(BASE_PATH, ''));
  });

  return true;
};

updateAllFile = (expr) => {
  Object.keys(pugMap).forEach(function (key, index) {
    if (pugMap[key].includeAry.length > 0) {
      if (key.match(expr)) {
        updateByFile(key);
      }
    }
  });
};

initPugMgr = (base, dest) => {
  BASE_PATH = base;
  DEST_PATH = dest;
};

scanPugFolder = async (expr) => {
  //掃描所有檔案
  console.log('XXX scanFolder');
  await scanFolder(BASE_PATH);

  //建立include的上下關係
  console.log('XXX refactorMap');
  refactorMap();

  //清除暫時性目錄，並複製無include關係的檔案
  console.log('XXX syncFolderFiles');
  rimraf.sync(DEST_PATH);
  await syncFolderFiles(expr);

  //一次性更新所有與include有關的檔案
  console.log('XXX updateAllFile');
  updateAllFile(expr);
};

syncFolderFiles = async (expr) => {
  console.log('start syncFolderFiles'); // time a

  await syncDirectory.async(BASE_PATH, DEST_PATH, {
    exclude(filePath) {
      let relativePath = filePath.replace(BASE_PATH, '');

      //不在指定範圍就不要複製
      if (expr && !relativePath.match(expr)) {
        return true;
      }
      //如果是有include的也不要複制，因為會進行include置換的動作
      return pugMap[relativePath];
    },
    watch: false,
    deleteOrphaned: true,
  });

  console.log('end syncFolderFiles');
};

rescan = async () => {
  pugMap = {};
  pugData = {};
  await scanPugFolder();
};

updateFile = async (srcFile) => {
  if (pugMap[srcFile]) {
    await parsePugFile(BASE_PATH + srcFile);
    return updateByFile(srcFile);
  }
  return false;
};

module.exports = { initPugMgr, scanPugFolder, rescan, updateFile };
