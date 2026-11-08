import "./styles.css";
import { createApp } from "./ui/app";
import { bindFiles } from "./ui/files";
import { bindGrids } from "./ui/grids";
import { bindInspector } from "./ui/inspector";
import { bindProofs } from "./ui/proofs";
import { bindStage } from "./ui/stage";
import { bindToolbar } from "./ui/toolbar";
import { $ } from "./ui/dom";

const app = createApp();

bindToolbar(app);
bindGrids(app);
bindStage(app);
bindInspector(app);
bindProofs();
bindFiles(app);

$("#undo").onclick = () => app.undo();
$("#redo").onclick = () => app.redo();

app.renderToolbar();
app.loadFont();
