# 调车随机刷题

这是一个纯前端刷题软件，题库来自 `调车题库(1).xlsx`，生成后的题库数据在 `questions.js` 中。

## 功能

- 每次刷题包含题库全部题目，题目顺序随机。
- 支持单选、判断、多选、填空题。
- 支持上一题、下一题，可返回修改答案。
- 答题过程中不显示答案，交卷后统一显示答题情况。
- 错题本保存在浏览器本地，下次打开仍会保留。
- 适配手机浏览器，可上传到 GitHub Pages 使用。

## 本地打开

双击 `打开调车随机刷题软件.bat`，或直接打开 `index.html`。

## 更新题库

把新的 Excel 替换为同名 `调车题库(1).xlsx`，然后运行：

```powershell
python build_questions.py
```

## 上传 GitHub Pages

把本文件夹里的所有文件上传到 GitHub 仓库根目录，在仓库 `Settings -> Pages` 中选择 `Deploy from a branch`，分支选择 `main`，目录选择 `/root`。
