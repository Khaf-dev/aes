/** Tekan/lepas gagang kunci torsi di close-up. Hasil tarikan dicatat ke mur dan slip log. */
import { beginPull, release } from "../logic/clickWrench.ts";
import { pull, useGame } from "./store.ts";

export function startPull() {
  const game = useGame.getState();
  if (!game.closeup || pull.holding) return;
  pull.state = beginPull(pull.state);
  pull.holding = true;
  useGame.setState({ pulling: true });
}

export function releasePull() {
  if (!pull.holding) return;
  pull.holding = false;
  const game = useGame.getState();
  useGame.setState({ pulling: false });
  const { state, result } = release(pull.state, game.setting);
  pull.state = state;
  if (!game.closeup) return;
  if (result.kind === "notSeated") game.setCloseupStatus("Dilepas sebelum mur duduk. Masih kencang tangan.");
  else if (result.kind === "noMove") game.setCloseupStatus("Tarikan belum melewati kencangan sebelumnya. Mur tidak bergerak.");
  else {
    game.recordTorque(game.closeup, result.value, result.feel);
    game.setCloseupStatus(
      result.feel === "klik" ? `Klik di ${game.setting} in-lb.`
        : result.feel === "tanpa klik" ? "Dilepas sebelum terdengar klik."
          : "Gagang terus ditarik setelah klik.",
    );
  }
}
