import Backend from "./backend.js";
import * as pubsub from "../pubsub.js";
import { Jsonified } from "../map.js";


declare const anythingllm: any;

interface Current {
	id: string | null;
	name: string | null;
	data: Jsonified | null;
}

export default class AnythingLLM extends Backend {
	protected ref: any;
	protected changeTimeout?: ReturnType<typeof setTimeout>;

	protected config: any;

	protected current: Current = {
		id: null,
		name: null,
		data: null
	}

	constructor() { super("anythingllm"); }

	connect(server: string, auth?: string) {
		// fixme move to constants?
		this.config = {
			apiKey: "M12EXCT-RGX4R4Z-HBN57Y4-31HB92W",
			apiUrl: "http://localhost:3001/api"
		};

		const request = new Request(`${this.config.apiUrl}/v1/workspaces`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${this.config.apiKey}`
			}
		});

		fetch(request).then(async (response) => {
			const data = await response.json();
			let values: any = {};
			if (data.workspaces) {
				data.workspaces.forEach((item: any) => {
					values[item.slug] = item.name;
				})
				pubsub.publish("anythingllm-list", this, values);
			}
		});
	}

	save(data: Jsonified, id: string, name: string) {
		this.ref.child("names/" + id).set(name);

		return new Promise<void>((resolve, reject) => {
			this.ref.child("data/" + id).set(data, (err?: any) => {
				if (err) {
					reject(err);
				} else {
					resolve();
					this.listenStart(data, id);
				}
			});
		});
	}

	load(id: string) {
		return new Promise<Jsonified>((resolve, reject) => {
			const request = new Request(`${this.config.apiUrl}/v1/workspace/${id}`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${this.config.apiKey}`
				}
			});
	
			fetch(request).then(async (response) => {
				const data = await response.json();
				console.log(data);
			});
			// this.ref.child("data/" + id).once("value", (snap:any) => {
			// 	var data = snap.val();
			// 	if (data) {
			// 		resolve(data);
			// 		this.listenStart(data, id);
			// 	} else {
			// 		reject(new Error("There is no such saved map"));
			// 	}
			// });
		});
	}

	remove(id: string) {
		this.ref.child("names/" + id).remove();

		return new Promise<void>((resolve, reject) => {
			this.ref.child("data/" + id).remove((err?:any) => {
				err ? reject(err) : resolve();
			});
		});
	}

	reset() {
		this.listenStop(); /* do not monitor current firebase ref for changes */
	}

	/**
	 * Merge current (remote) data with updated map
	 */
	mergeWith(data: Jsonified, name: string) {
		let id = this.current.id!;

		if (name != this.current.name) {
			this.current.name = name;
			this.ref.child("names/" + id).set(name);
		}

		var dataRef = this.ref.child("data/" + id);
		var oldData = this.current.data;

		this.listenStop();
		this.recursiveRefMerge(dataRef, oldData, data);
		this.listenStart(data, id);
	}

	/**
	 * @param {AnythingLLM} ref
	 * @param {object} oldData
	 * @param {object} newData
	 */
	protected recursiveRefMerge(ref: any, oldData: any, newData: any) {
		let updateObject: Record<string, any> = {};

		if (newData instanceof Array) { /* merge arrays */

			for (var i=0; i<newData.length; i++) {
				var newValue = newData[i];

				if (!(i in oldData)) { /* new key */
					updateObject[i] = newValue;
				} else if (typeof(newValue) == "object") { /* recurse */
					this.recursiveRefMerge(ref.child(i), oldData[i], newValue);
				} else if (newValue !== oldData[i]) { /* changed key */
					updateObject[i] = newValue;
				}
			}

			for (var i=newData.length; i<oldData.length; i++) { updateObject[i] = null; } /* removed array items */

		} else { /* merge objects */

			for (var p in newData) { /* new/changed keys */
				var newValue = newData[p];

				if (!(p in oldData)) { /* new key */
					updateObject[p] = newValue;
				} else if (typeof(newValue) == "object") { /* recurse */
					this.recursiveRefMerge(ref.child(p), oldData[p], newValue);
				} else if (newValue !== oldData[p]) { /* changed key */
					updateObject[p] = newValue;
				}

			}

			for (var p in oldData) { /* removed keys */
				if (!(p in newData)) { updateObject[p] = null; }
			}

		}

		if (Object.keys(updateObject).length) { ref.update(updateObject); }
	}

	protected listenStart(data: Jsonified, id: string) {
		if (this.current.id && this.current.id == id) { return; }

		this.listenStop();
		this.current.id = id;
		this.current.data = data;

		this.ref.child("data/" + id).on("value", this.onValueChange, this);
	}

	protected listenStop() {
		if (!this.current.id) { return; }

		this.ref.child("data/" + this.current.id).off("value");
		this.current.id = null;
		this.current.name = null;
		this.current.data = null;
	}


	/**
	 * Monitored remote ref changed.
	 * FIXME move timeout logic to ui.backend.anythingllm?
	 */
	protected onValueChange(snap:any) {
		this.current.data = snap.val();

		clearTimeout(this.changeTimeout!);
		this.changeTimeout = setTimeout(() => {
			pubsub.publish("anythingllm-change", this, this.current.data);
		}, 200);
	}

}
