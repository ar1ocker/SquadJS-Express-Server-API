//@ts-check
import BasePlugin from "./base-plugin.js";
import express from "express";

export default class ExpressServerAPI extends BasePlugin {
  static get description() {
    return "Express server api";
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      players_path: {
        required: true,
      },
      leaders_path: {
        required: true,
      },
      killfeed_path: {
        required: true,
      },
      port: {
        required: true,
      },
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.lastWounded = [];

    this.app = express();

    this.app.use((req, res, next) => {
      res.append("Access-Control-Allow-Origin", ["*"]);
      res.append("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
      res.append("Access-Control-Max-Age", "120");
      next();
    });

    this.app.get(this.options.players_path, (req, res) => {
      res.json(this.getPlayers());
    });

    this.app.get(this.options.leaders_path, (req, res) => {
      res.json(this.getLeaders());
    });

    this.app.get(this.options.killfeed_path, (req, res) => {
      let lastN;
      let lastTime;

      if (typeof req.query.lasttime === "string") {
        lastTime = new Date(parseInt(req.query.lasttime)).getTime();
        if (isNaN(lastTime)) {
          lastTime = null;
        }
      }

      if (typeof req.query.lastn === "string") {
        lastN = parseInt(req.query.lastn);
        if (isNaN(lastN) || lastN < 1) {
          lastN = 10;
        }
      }

      if (lastTime) {
        res.json(this.getKillFeedByLastTime(lastTime));
      } else {
        res.json(this.getKillFeedByLastN(lastN));
      }
    });
  }

  formatPlayerInfo(player) {
    return {
      name: player.name,
      playerID: player.playerID,
      steamID: player.steamID,
      teamID: player.teamID,
      squadID: player.squadID,
      squadName: player.squad?.squadName || null,
      isLeader: player.isLeader,
      role: player.role,
    };
  }

  getPlayers() {
    let players = [];
    for (const player of this.server.players) {
      players.push(this.formatPlayerInfo(player));
    }

    return players;
  }

  getLeaders() {
    let leaders = [];
    for (const player of this.server.players) {
      if (player.isLeader) {
        leaders.push(this.formatPlayerInfo(player));
      }
    }

    leaders.sort((a, b) => {
      return a.squadID - b.squadID;
    });

    return leaders;
  }

  getKillFeedByLastN(lastN) {
    return this.lastWounded.slice(-lastN);
  }

  getKillFeedByLastTime(lastTime) {
    for (const index of this.lastWounded.keys()) {
      if (this.lastWounded[index].time >= lastTime) {
        return this.lastWounded.slice(index + 1);
      }
    }
  }

  updateWoundData(data) {
    if (!data.attacker?.steamID || !data.victim?.steamID) {
      return;
    }

    this.lastWounded.push({
      time: data.time.getTime(),
      attacker: this.formatPlayerInfo(data.attacker),
      victim: this.formatPlayerInfo(data.victim),
      damage: data.damage,
      weapon: data.weapon,
      teamkill: data.teamkill,
      suicide: data.attacker.steamID === data.victim.steamID,
    });

    if (this.lastWounded.length > 30) {
      this.lastWounded.shift();
    }
  }

  async mount() {
    this.app.listen(this.options.port, () => {
      console.log(`Express API run on the port ${this.options.port}`);
    });

    this.server.on("PLAYER_WOUNDED", (data) => {
      this.updateWoundData(data);
    });
  }
}
