import './style.css';
import { Game } from './game/game';
import { WIDTH, HEIGHT } from './game/constants';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('#game canvas element not found');
}

canvas.width = WIDTH;
canvas.height = HEIGHT;

new Game(canvas).start();
