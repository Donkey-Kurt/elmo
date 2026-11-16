# 上游同步手册

> 本仓库是 [elmohq/elmo](https://github.com/elmohq/elmo) 的 fork，`zh-cn` 分支承载界面汉化。
> 本文说明如何在不丢汉化的前提下跟进上游更新。

---

## 一、当前配置（已完成，无需再做）

### remote 结构

| remote | 指向 | 用途 |
|---|---|---|
| `origin` | `github.com/Donkey-Kurt/elmo` | 你自己的 fork，日常 push 都到这里 |
| `upstream` | `github.com/elmohq/elmo` | 官方仓库，**只读取，从不写入** |

### 分支结构

| 分支 | 内容 | 跟踪 |
|---|---|---|
| `main` | 上游镜像，保持与官方一致，**不放汉化** | `origin/main` |
| `zh-cn` | 汉化分支，日常开发在这里 | `origin/zh-cn` |

因为两个分支都跟踪 `origin`（自己的 fork），`git push` 永远不会误推到官方仓库。

### 已开启的辅助配置

```powershell
rerere.enabled      = true   # 记住冲突解法，重复冲突自动复用
rerere.autoupdate   = true   # 记起的解法自动写回工作区
merge.conflictStyle = zdiff3 # 冲突标记带共同祖先，更好判断
```

`rerere` 是跟版最省力的工具：同一个文件第二次出现同类冲突时，git 会自动套用你上次的解法。

---

## 二、日常三条命令

```powershell
git status                    # 看当前分支和改动
git checkout zh-cn            # 切到汉化分支（日常都在这）
git push origin zh-cn         # 备份汉化成果到 GitHub
```

**习惯**：每完成一小块汉化或修改就 `git commit` + `git push`。不要攒着。

---

## 三、跟版完整流程

### 触发时机

上游平均每周 1–2 个版本。看到新 tag 就可以跟。**建议每周跟一次，不要攒**——实测数据：

| 跟版粒度 | 预期冲突文件数 |
|---|---|
| 单个小版本 | 0–5 个 |
| 攒 8 天 | 约 9 个 |
| 攒 3 周 | 约 62 个 |

攒得越久越痛苦，这是这套流程里最重要的一条经验。

### 第 1 步：确认工作区干净

```powershell
git status
```

如果有未提交改动，先提交或 stash。**不要在脏工作区上 merge。**

### 第 2 步：拉取上游

```powershell
git fetch upstream --tags
git log --oneline HEAD..upstream/main    # 看看有什么新东西
```

### 第 3 步：合并到 zh-cn

```powershell
git checkout zh-cn
git merge upstream/main
```

预期：0–5 个文件冲突。

- **无冲突** → 跳到第 5 步
- **有冲突** → 继续第 4 步

### 第 4 步：解决冲突

```powershell
git status                    # 列出冲突文件（both modified）
git diff --name-only --diff-filter=U   # 只看冲突文件
```

逐个打开冲突文件，搜索 `<<<<<<<`，会看到：

```
<<<<<<< HEAD
        <h2>总览</h2>          ← 你的中文
=======
        <h2>Overview</h2>      ← 上游的英文（通常上游也改了这段）
>>>>>>> upstream/main
```

**处理原则**：

1. 上游只是改了文案措辞 → 保留你的中文，但检查语义是否还准确（上游可能改了功能含义）
2. 上游改了这段的**代码结构**（加了 props、改了组件名）→ 采用上游结构，把文案换成中文
3. 上游新增的界面文案 → 顺手翻译成中文，保持全站一致

解决后：

```powershell
git add <冲突文件>
git merge --continue
```

### 第 5 步：验证（不能跳过）

```powershell
corepack pnpm --filter @workspace/web check-types
corepack pnpm --filter @workspace/lib check-types
corepack pnpm --filter @workspace/lib test
```

三个都必须退出码 0。类型检查能抓住"上游改了组件接口、你的中文文案还在但参数对不上"这类问题。

**建议再做一次人工检查**：启动应用，把主要页面点一遍，确认没有出现中英文混杂或布局错位。

```powershell
# 终端 1
corepack pnpm --filter @workspace/web dev
# 终端 2
corepack pnpm --filter @workspace/worker dev
```

### 第 6 步：更新 main 镜像并推送

```powershell
git checkout main
git merge --ff-only upstream/main     # main 必须能快进，不能就说明 main 被污染了
git push origin main

git checkout zh-cn
git push origin zh-cn
```

---

## 四、出问题怎么回滚

### 合并到一半想放弃

```powershell
git merge --abort
```

### 合并已完成但结果不对

```powershell
git reset --hard ORIG_HEAD     # 回到 merge 之前
```

`ORIG_HEAD` 是 git 自动记录的操作前状态，只在刚执行完 merge/reset 后有效。

### 彻底搞乱了，只想回到上一次推送的状态

```powershell
git fetch origin
git reset --hard origin/zh-cn
```

这条会丢弃所有本地未推送的改动。**执行前确认没有未推送的东西。**

---

## 五、这套方案的局限（要知道）

1. **汉化仍然是硬编码文案**，不是 i18n。上游改一个文件的文案行，你就可能冲突一次。
2. **不能直接向上游提 PR**——你的改动是全面替换，不是他们能接受的形式。
3. **`main` 必须保持纯净**。一旦在 `main` 上做汉化，快进合并就失效了，整个流程会变复杂。

---

## 六、如果想更省力（中期优化）

当前每次跟版的冲突面是"散落在 100 个文件里的文案行"。如果能把这些文案集中到一个字典文件，冲突面会大幅缩小。

具体做法：

1. 新建 `apps/web/src/i18n/zh.ts`，把所有中文文案按模块组织成对象
2. 组件里改成 `t("brand.name")` 的形式引用
3. 以后上游改组件代码时，你这边只剩一行 `t(...)` 调用，冲突概率大幅下降

**代价**：这是一次性重做 101 个文件的改造，约 2–3 天工作量。收益是长期跟版几乎无感。

**建议的投入时机**：确认 elmo 确实要长期用下去、并且已经接上真实数据之后再做。现在还在验证阶段，不建议投入。

---

## 七、一条命令检查当前状态

```powershell
# 看看落后上游多少
git fetch upstream --tags
git log --oneline HEAD..upstream/main
```

输出为空 = 已是最新。
