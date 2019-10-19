import AWS from 'aws-sdk';
import { pathOr, values } from 'ramda';
import chalk from 'chalk';

export class CreateDynamoDBGlobalTables {
  serverless: any;
  options: any;
  tableRegions: any;
  initialRegion: any;
  hooks: any;

  constructor(serverless: any, options: any) {
    this.serverless = serverless;
    this.options = options;
    this.tableRegions = pathOr([], ['service', 'custom', 'globalTable', 'regions'], serverless);
    this.initialRegion = this.serverless.service.provider.region;
    this.hooks = {
      'after:aws:deploy:deploy:updateStack': this.createGlobalTables.bind(this),
      'remove:remove': this.deleteGlobalTables.bind(this)
    };
  }

  async createGlobalTables() {
    const tableName = this.getTableName();
    const table = this.getTable();

    table.Properties.StreamSpecification.StreamEnabled = true;

    await Promise.all(this.tableRegions.map((t: string) => this.createTable(table, t)));
    await this.createGlobalTable(tableName);
  }

  async deleteGlobalTables() {
    const tableName = this.getTableName();
    await Promise.all(this.tableRegions.map((t: string) => this.deleteTable(tableName, t)));
  }

  getTable() {
    return values(this.serverless.service.resources.Resources)
      .filter((r: any) => r.Type === 'AWS::DynamoDB::Table')[0];
  }

  getTableName() {
    const tableNames = values(this.serverless.service.resources.Resources)
      .filter((r: any) => r.Type === 'AWS::DynamoDB::Table')
      .map((r: any) => r.Properties.TableName)[0]

    return tableNames;
  }

  async createTable(tableTemplate: any, region: string) {
    this.log(`Creating table named: ${chalk.yellow(tableTemplate.Properties.TableName)} in ${chalk.yellow(region)}`);
    const dynamo = new AWS.DynamoDB({ region });
    try {
      await dynamo.createTable(tableTemplate.Properties).promise();
      this.log(`Created Table ${tableTemplate.Properties.TableName} in ${region}`);
    } catch (error) {
      if (error.code === 'TableAlreadyExistsException' || error.code === 'ResourceInUseException') {
        this.log(`Table already exists, skipping`);
      } else {
        throw error;
      }
    }
  }

  async deleteTable(tableName: string, region: string) {
    const dynamo = new AWS.DynamoDB({ region });
    try {
      await dynamo.deleteTable({ TableName: tableName }).promise();
      this.log(`Delete Table ${tableName} in ${region}`);
    } catch (error) {
      throw error;
    }
  }

  async createGlobalTable(tableName: string) {
    this.log(`Creating global table for: ${chalk.yellow(tableName)}`);
    const dynamo = new AWS.DynamoDB({ region: this.initialRegion });
    const params = {
      GlobalTableName: tableName,
      ReplicationGroup: [
        ...this.tableRegions,
        this.initialRegion
      ].map(r => ({
        RegionName: r
      }))
    };

    try {
      await dynamo.createGlobalTable(params).promise();
      this.log(`Added Global Table ${tableName}`);
    } catch (error) {
      if (error.code === 'GlobalTableAlreadyExistsException') {
        this.log(`Global table ${tableName} already exists`);
      } else {
        throw error;
      }
    }
  }

  log(message: string) {
    this.serverless.cli.consoleLog(`DynamoDB Global Tables: ${chalk.yellow(message)}`);
  }
}
