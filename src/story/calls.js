// ---------------------------------------------------------------------------
// Phone calls played at the start of each night.
//
// Each call has a caller label, a voice preset (see AudioEngine.PHONE_VOICES)
// and a list of lines. A line whose text is in [brackets] is a stage direction:
// it is shown in italics, is not spoken, and usually triggers a sound (`fx`).
// Optional per-line `who` and `voice` override the caller for that line.
// `dur` overrides the automatic line length (seconds).
// ---------------------------------------------------------------------------

export const CALLS = {
  1: {
    caller: 'WALT (PREVIOUS GUARD)',
    voice: 'walt',
    lines: [
      { text: "Hello? Hey, hello! Oh good, it picked up. Welcome to Mortimer's. I'm Walt. I had your chair before you." },
      { text: 'Corporate asked me to leave you a few pointers, so... here I am. On the phone. At midnight. Living the dream.' },
      { text: "First thing: the characters. Mortimer, Hopscotch, Pippa. Somebody left them on free-roam mode years ago and nobody ever figured out how to switch it off." },
      { text: "So they wander at night. Mostly harmless. Mostly. If one of them ends up at your door, shut it. They get bored and walk away." },
      { text: "Power's on a budget. Doors, lights, the monitor, they all eat into it. Don't leave stuff running you don't need." },
      { text: "Oh, and there's a dog. Scraps. Storage room, behind the curtain. Look in on him every so often. He doesn't like being forgotten." },
      { text: "Last tip: don't stare at the cameras all night. Listen. You'll hear them before you see them." },
      { text: 'Okay. Talk tomorrow. Probably.' },
    ],
  },

  2: {
    caller: 'WALT (PREVIOUS GUARD)',
    voice: 'walt',
    lines: [
      { text: 'Hey, you made it! See? Told you it was fine.' },
      { text: "Hopscotch is going to be busier tonight. He likes the left hall, and he gets antsy when you stop checking the cameras. Like a kid nobody's watching." },
      { text: "Pippa likes the kitchen. You'll hear pots crashing. That's just noise. But she chews on the camera wiring, so if a feed goes dead, that's her." },
      { text: 'And sometimes she sticks her face right into the lens. Ha. First time, I nearly had a real heart attack.' },
      { text: "Now, Scraps. If you hear a jingle and something running down the left hall, shut the left door. Right away. Don't check first. Just shut it." },
      { text: 'Watching his curtain keeps him put. Remember that. Okay. Goodnight.' },
    ],
  },

  3: {
    caller: 'WALT (PREVIOUS GUARD)',
    voice: 'walt',
    lines: [
      { text: "Hey. So. Mortimer's moving now. I honestly wasn't sure he still could." },
      { text: "He won't move while you're watching him. So if you lose track of him, that's on you, not him." },
      { text: "He likes the dark. Sometimes you'll only see his eyes. Sometimes you won't see anything, and that's worse." },
      { text: "And his laugh carries through the vents. Don't trust which side it comes from. Use the lights." },
      { text: "If he's at your door and you've got your face in that monitor, he will come in. Put it down." },
      { text: "One more thing. I think they've started... working together. Keep one door shut too long and the ones on the other side get ideas." },
      { text: "I'm, uh, on the day shift from now on. You'll be fine." },
    ],
  },

  4: {
    caller: 'WALT (PREVIOUS GUARD)',
    voice: 'walt',
    lines: [
      { text: "Hey. Hey, you there? I'm calling from the front booth. I came back for my jacket." },
      { text: "The front doors are locked. From the inside. I didn't lock them." },
      { text: "Did you scratch something into the desk? Because it wasn't me, and I sat in that chair for two years." },
      { text: "I can hear footsteps in the dining room. Is that you? No... no, you're in the office." },
      { text: "Okay. Listen to me. Shut the doors when you hear them. Don't let them see you're scared. They learn. They learn everything." },
      { text: "Hang on. Something's at the -", dur: 2.2 },
      { text: '[heavy banging]', fx: 'bang', dur: 2.4 },
      { text: '[static]', fx: 'static', dur: 2.0 },
    ],
  },

  5: {
    caller: 'UNKNOWN NUMBER',
    voice: 'bear',
    lines: [
      { text: '[a cassette clicks. Warped, cheerful music]', fx: 'music', dur: 3.2 },
      { text: "Hi there, friend! It's me, Mortimer! Welcome to Mortimer's Family Diner, where every night's a party!", who: 'MORTIMER?' },
      { text: 'Remember the rules, friend: stay in your seat, keep your hands to yourself...', who: 'MORTIMER?' },
      { text: '...and never, ever leave before the show is over!', who: 'MORTIMER?' },
      { text: '[the tape drags and slows]', fx: 'tapeslow', dur: 2.4 },
      { text: 'the show... is never... over...', who: 'MORTIMER?', voice: 'bearSlow' },
      { text: '[click]', fx: 'static', dur: 1.4 },
    ],
  },

  6: {
    caller: '????',
    voice: 'ghost',
    lines: [
      { text: '[someone is breathing on the line]', fx: 'breath', dur: 3.0 },
      { text: "...hello? Can you hear me? It's Walt.", who: 'WALT?' },
      { text: "I don't know where I am. It's dark. It smells like old popcorn and wet fur.", who: 'WALT?' },
      { text: "There's a little camera above me. A red light. Is that you? Are you watching me?", who: 'WALT?' },
      { text: "If you're watching... don't stop. Please. Don't stop watching.", who: 'WALT?' },
      { text: '[a collar jingles, very close to the phone]', fx: 'jingle', dur: 2.6 },
      { text: '[the line goes dead]', fx: 'static', dur: 1.6 },
    ],
  },
};

/** Seconds a spoken line stays up: based on its length. */
export function lineDuration(line) {
  if (line.dur) return line.dur;
  return Math.max(1.8, line.text.length * 0.058);
}

export const isStageDirection = (line) => line.text.startsWith('[');
