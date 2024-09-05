import BackendUI, { buildList, Mode } from "./backend.js";
import AnythingLLM from "../../backend/anythingllm.js";
import * as pubsub from "../../pubsub.js";
import * as app from "../../my-mind.js";


interface State {
	id: string;
	b: string;
	s: string;
	a?: string;
}

export default class AnythingLLMUI extends BackendUI<AnythingLLM> {
	protected online = false;
	protected itemChangeTimeout?: ReturnType<typeof setTimeout>;

	constructor() {
		super(new AnythingLLM(), "AnythingLLM");

		const { server, remove, go } = this;

		server.value = localStorage.getItem(`${this.prefix}.server`) || "my-mind";
		go.disabled = false;

		remove.addEventListener("click", async _ => {
			var id = this.list.value;
			if (!id) { return; }
			app.setThrobber(true);
			try {
				await this.backend.remove(id);
				app.setThrobber(false);
			} catch (e) { this.error(e); }
		});

		pubsub.subscribe("anythingllm-list", this);
		pubsub.subscribe("anythingllm-change", this);
	}

	get auth() { return this.node.querySelector<HTMLInputElement>(".auth")!; }
	get server() { return this.node.querySelector<HTMLInputElement>(".server")!; }
	get remove() { return this.node.querySelector(".remove")!; }
	get list() { return this.node.querySelector<HTMLSelectElement>(".list")!; }

	async setState(data: State) {
		try {
			await this.connect(data.s, data.a);
			this.load(data.id);
		} catch (e) { this.error(e); }
	}

	getState() {
		var data: State = {
			id: app.currentMap.id,
			b: this.id,
			s: this.server.value
		};
		return data;
	}

	show(mode: Mode) {
		super.show(mode);
		this.sync();
	}

	handleMessage(message: string, _publisher?: any, data? : any) {
		switch (message) {
			case "anythingllm-list":
				this.list.innerHTML = "";
				if (Object.keys(data).length) {
					buildList(data, this.list);
				} else {
					var o = document.createElement("option");
					o.innerHTML = "(no maps saved)";
					this.list.appendChild(o);
				}
				this.sync();
			break;

			case "anythingllm-change":
				if (data) {
					pubsub.unsubscribe("item-change", this);
					app.currentMap.mergeWith(data);
					pubsub.subscribe("item-change", this);
				} else { /* FIXME */
					console.log("remote data disappeared");
				}
			break;

			case "item-change":
				clearTimeout(this.itemChangeTimeout!);
				this.itemChangeTimeout = setTimeout(() => this.onItemChange(), 200);
			break;
		}
	}

	reset() {
		this.backend.reset();
		pubsub.unsubscribe("item-change", this);
	}

	protected onItemChange() {
		var map = app.currentMap;
		this.backend.mergeWith(map.toJSON(), map.name);
	}

	protected submit() {
		if (!this.online) {
			this.connect(this.server.value);
			return;
		}

		super.submit();
	}

	async save() {
		app.setThrobber(true);

		var map = app.currentMap;
		try {
			await this.backend.save(map.toJSON(), map.id, map.name);
			this.saveDone();
			pubsub.subscribe("item-change", this);
		} catch (e) { this.error(e); }
	}

	async load(id = this.list.value) {
		console.log(this.list);
		app.setThrobber(true);
		try {
			let data = await this.backend.load(id);
			this.loadDone(data);
			pubsub.subscribe("item-change", this);
		} catch (e) { this.error(e); }
	}

	protected async connect(server: string, auth?: string) {
		this.server.value = server;
		this.server.disabled = true;

		localStorage.setItem(`${this.prefix}.server`, server);

		this.go.disabled = true;
		app.setThrobber(true);

		await this.backend.connect(server);
		app.setThrobber(false);
		this.online = true;
		this.sync();
	}

	protected sync() {
		if (!this.online) {
			this.go.textContent = "Connect";
			return;
		}

		this.go.disabled = false;
		if (this.mode == "load" && !this.list.value) { this.go.disabled = true; }
		this.go.textContent = this.mode.charAt(0).toUpperCase() + this.mode.substring(1);
	}
}
