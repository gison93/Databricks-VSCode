import * as vscode from 'vscode';
import * as fspath from 'path';
import { DatabricksApiService } from '../databricksApiService';
import { ThisExtension } from '../../ThisExtension';
import { ClusterState, ClusterSource, ClusterTreeItemType } from './_types';
import { iDatabricksCluster } from './iDatabricksCluster';
import { iDatabricksRuntimeVersion } from './iDatabricksRuntimeVersion';
import { Helper } from '../../helpers/Helper';

// https://vshaxe.github.io/vscode-extern/vscode/TreeItem.html
export class DatabricksClusterTreeItem extends vscode.TreeItem {
	private _item_type:	ClusterTreeItemType;
	private _id: string;
	private _name: string;
	private _state: ClusterState;
	private _definition: iDatabricksCluster;
	private _source:	ClusterSource;
	
	constructor(
		type: ClusterTreeItemType,
		definition: iDatabricksCluster
	) {
		super(definition.cluster_name || "ROOT");
		this._item_type = type;
		this._definition = definition;
		this._id = definition.cluster_id;
		this._name = definition.cluster_name;
		this._state = definition.state;
		this._source = definition.cluster_source;

		// clusters are never expandable
		super.collapsibleState = undefined;
		if (["ROOT", "JOB_CLUSTER_DIR"].includes(this.item_type)) {
			super.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
		}
		super.iconPath = {
			light: this.getIconPath("light"),
			dark: this.getIconPath("dark")
		};
	}

	get tooltip(): string {
		if (["ROOT", "JOB_CLUSTER_DIR"].includes(this.item_type)) {
			return null;
		}
		return `${this.cluster_id} (${this.state})`;
	}

	// description is show next to the label
	get description(): string {
		if (["ROOT", "JOB_CLUSTER_DIR"].includes(this.item_type)) {
			return null;
		}
		return `${this.cluster_id} (${this.state})`;
	}

	// used in package.json to filter commands via viewItem == CANSTART
	get contextValue(): string {
		if (["ROOT", "JOB_CLUSTER_DIR"].includes(this.item_type)) 
		{ 
			return null;
		}

		if(['RUNNING', 'ERROR', 'UNKNOWN', 'PENDING'].includes(this.state))
		{
			return 'CAN_STOP';
		}
		if(['UNKNOWN', 'RESTARTING', 'RESIZING', 'TERMINATING','TERMINATED'].includes(this.state))
		{
			return 'CAN_START';
		}
	}

	private getIconPath(theme: string): string {
		let state = (this.contextValue == "CAN_START" ? 'stop' : 'start');
		if (["ROOT", "JOB_CLUSTER_DIR"].includes(this.item_type)) { state = fspath.join("workspace", "directory"); }
		return fspath.join(ThisExtension.rootPath, 'resources', theme, state + '.png');
	}

	readonly command = {
		command: 'databricksClusterItem.click', title: "Open File", arguments: [this]
	};


	get definition (): iDatabricksCluster {
		return this._definition;
	}

	get cluster_name (): string {
		return this._name;
	}

	get cluster_id (): string {
		return this._id;
	}

	get state (): ClusterState {
		if(this._state == undefined)
		{
			return "UNKNOWN";
		}
		return this._state;
	}

	get item_type(): ClusterTreeItemType {
		return this._item_type;
	}

	get cluster_source(): ClusterSource {
		return this._source;
	}

	async getChildren(): Promise<DatabricksClusterTreeItem[]> {
		let clusters: iDatabricksCluster[] = await DatabricksApiService.listClusters();
		let items: DatabricksClusterTreeItem[] = [];

		if (this.item_type === 'ROOT') {
			
			let job_clusters_found: boolean = false;
			for (let cluster of clusters) {
				if (["API", "UI"].includes(cluster.cluster_source))
				{
					items.push(new DatabricksClusterTreeItem("CLUSTER", cluster));
				}
				if (["JOB"].includes(cluster.cluster_source)) {
					job_clusters_found = true;
				}
			}

			if(job_clusters_found)
			{
				items.push(DatabricksClusterTreeItem.getDummyItem("JOB_CLUSTER_DIR"));
			}
		}
		else if (this.item_type === 'JOB_CLUSTER_DIR') {
			for (let cluster of clusters) {
				if (["JOB"].includes(cluster.cluster_source)) {
					items.push(new DatabricksClusterTreeItem("CLUSTER", cluster));
				}
			}
		}
		return items;
	}

	static fromJson(jsonString: string): DatabricksClusterTreeItem {
		let item: iDatabricksCluster = JSON.parse(jsonString);
		return new DatabricksClusterTreeItem("CLUSTER", item);
	}

	static getDummyItem(item_type: ClusterTreeItemType): DatabricksClusterTreeItem {
		let def: any = { cluster_name: item_type}; // cluster_name is the only mandatory property!

		if(item_type == "JOB_CLUSTER_DIR") {
			def.cluster_name = 'Job Clusters';
		}
		return new DatabricksClusterTreeItem(item_type, def);
	}

	async start(): Promise<void> {
		let response = DatabricksApiService.startCluster(this.cluster_id);

		response.then((response) => {
			vscode.window.showInformationMessage(`Starting cluster ${this.label} (${this.cluster_id}) ...`);
		}, (error) => {
			vscode.window.showErrorMessage(`ERROR: ${error}`);
		});

		await Helper.wait(5000);
		vscode.commands.executeCommand("databricksClusters.refresh", false);
	}

	async stop(): Promise<void> {
		let response = DatabricksApiService.stopCluster(this.cluster_id);

		response.then((response) => {
			vscode.window.showInformationMessage(`Stopping cluster ${this.label} (${this.cluster_id}) ...`);
		}, (error) => {
			vscode.window.showErrorMessage(`ERROR: ${error}`);
		});

		await Helper.wait(5000);
		vscode.commands.executeCommand("databricksClusters.refresh", false);
	}

	async delete(): Promise<void> {
		vscode.window.showErrorMessage(`Not yet implemented!`);
	}

	async showDefinition(): Promise<void> {
		await Helper.openTempFile(JSON.stringify(this.definition, null, "\t"), this.cluster_name + '.json');
	}

	async click(): Promise<void> {
		await Helper.singleVsDoubleClick(this, this.singleClick, this.doubleClick);
	}

	async doubleClick(): Promise<void> {
		await this.showDefinition();
	}

	async singleClick(): Promise<void> { }
}