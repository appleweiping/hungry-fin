# Brinefin

一个浏览器里的鲨鱼街机小游戏：吃掉比你小的鱼，长大，躲开比你大的东西。电脑和手机都能玩，不用安装，也没有构建步骤。

**在线试玩：https://appleweiping.github.io/hungry-fin/**

![一局开头的十秒](assets/brinefin.gif)

仓库名仍是 `hungry-fin`，这是游戏最早的名字。因为它和一款商业鲨鱼游戏的名字太接近，游戏本身改名为 Brinefin。

[English](README.md)

## 操作

| 动作 | 鼠标 / 键盘 | 触屏 |
|---|---|---|
| 游动 | 移动鼠标（鲨鱼跟随光标），或 `W` `A` `S` `D` / 方向键 | 在屏幕左半边拖动（浮动摇杆） |
| 加速 | 按住鼠标左键、`Space` 或左 `Shift` | 按住加速按钮 |
| 咬 | 嘴碰到能吃的东西时自动咬 | 同左 |
| 挣脱渔网 | 连续按加速 | 连续点加速按钮 |
| 暂停 | `Esc` 或 `P` | 顶部的暂停按钮 |

饥饿条就是血条，会一直下降，只有吃东西才能补。连续进食会叠连击；金色条满了会进入短暂的 Gold Rush，期间什么都能吃。每局赚到的金币可以在商店里买更大的鲨鱼。进度保存在浏览器的 `localStorage` 里，没有账号系统。

## 本地运行

```bash
git clone https://github.com/appleweiping/hungry-fin.git
cd hungry-fin
python -m http.server 8000     # 然后打开 http://localhost:8000
```

直接双击 `index.html` 也能运行，因为游戏用的是普通 `<script>` 标签而不是 ES 模块。

`node tools/check.mjs` 会检查所有脚本能否解析、数值表是否自洽；CI 在每次 push 时运行同样的检查。

## 实现要点

- **Three.js r147，直接放在仓库里**（`vendor/three.min.js`），所以离线和 `file://` 下都能跑。
- **没有任何图片、模型或音频文件。** 鲨鱼由 `js/gfx/sharkBuilder.js` 按截面放样生成，其他生物来自 `js/gfx/modelKit.js`；音效由 Web Audio 振荡器和滤波噪声实时合成。
- **每种生物一次绘制调用**：每个物种是一个 `InstancedMesh`，游动摆尾是通过 `onBeforeCompile` 注入的顶点着色器弯曲。
- **所有可调数值都在 [`js/data/balance.js`](js/data/balance.js)**，新增生物只需加一行数据，复用六种行为类型之一。

## 许可

[MIT](LICENSE)。Three.js 使用其自身的 MIT 许可（[vendor/LICENSE-three.txt](vendor/LICENSE-three.txt)）。
