// ---------------------------------------------------------------------------
// Interactive first-night tutorial. While it runs the night is frozen (no
// clock, power drain or AI). Each step waits for the player to actually do
// the thing it describes (or press NEXT).
// ---------------------------------------------------------------------------

const STEPS = [
  {
    text: 'This is your office. Move the mouse to the <b>left or right edge</b> of the screen to look around. (Arrow keys work too.)',
    wait: 'pan',
  },
  {
    text: 'Each doorway has two buttons. Click a <b>LIGHT</b> button to light up that hallway and see who is standing outside.',
    wait: 'light',
    highlight: 'leftLight',
  },
  {
    text: 'Click a <b>DOOR</b> button to slam the security door shut. A closed door stops anything from getting in... but it eats power. Open it again when the hallway is clear.',
    wait: 'door',
    highlight: 'leftDoor',
  },
  {
    text: 'Raise the <b>security monitor</b> with the bar at the bottom of the screen (or press <b>SPACE</b>).',
    wait: 'monitorUp',
    dom: 'camToggle',
  },
  {
    text: 'Click the <b>CAM</b> buttons on the map to switch cameras. Track where the animatronics are. Keep a close eye on <b>CAM 06 (Storage)</b> - something lives behind that curtain. Watching it keeps it there; ignore it and it will come running.',
    wait: 'camSwitch',
    dom: 'camMap',
    low: true,
  },
  {
    text: 'Lower the monitor again. While you stare at the screen you cannot see your doors.',
    wait: 'monitorDown',
    dom: 'camToggle',
    low: true,
  },
  {
    text: '<b>POWER</b> (bottom left) drains faster the more systems you use - see the USAGE bars. If it hits 0%, everything shuts off. The <b>clock</b> (top right) runs from 12 AM to 6 AM. Survive until 6 AM. Listen for footsteps. Good luck.',
    wait: 'next',
    dom: ['powerBox', 'clock'],
    final: true,
  },
];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.i = -1;
    this.active = false;
    this.el = document.getElementById('tutorial');
  }

  start() {
    this.active = true;
    this.i = -1;
    this.el.classList.remove('hidden');
    this.next();
  }

  get step() {
    return STEPS[this.i];
  }

  /** Called by the game whenever the player performs an action. */
  notify(action) {
    if (!this.active || !this.step) return;
    if (this.step.wait === action) setTimeout(() => this.active && this.step?.wait === action && this.next(), 450);
  }

  next() {
    this.clearHighlights();
    this.i++;
    if (this.i >= STEPS.length) return this.finish(false);
    const s = this.step;
    document.getElementById('tutStep').textContent = `TRAINING ${this.i + 1} / ${STEPS.length}`;
    document.getElementById('tutText').innerHTML = s.text;
    document.getElementById('tutNext').textContent = s.final ? 'BEGIN SHIFT' : 'NEXT';
    this.el.classList.toggle('top-low', !!s.low);
    this.game.office.highlight = s.highlight ?? null;
    for (const id of [].concat(s.dom ?? [])) document.getElementById(id)?.classList.add('tut-highlight');
  }

  clearHighlights() {
    document.querySelectorAll('.tut-highlight').forEach((e) => e.classList.remove('tut-highlight'));
    this.game.office.highlight = null;
  }

  finish(skipped) {
    if (!this.active) return;
    this.active = false;
    this.clearHighlights();
    this.el.classList.add('hidden');
    this.game.onTutorialDone(skipped);
  }
}
