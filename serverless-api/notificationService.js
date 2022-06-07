'use strict';
const AWS = require('aws-sdk');
const { getUserId } = require('./getUserId');

const { DYNAMODB_USERS_WS_CONNECTIONS_TABLE, WS_CONNECTION_URL } = process.env;

const dynamodb = new AWS.DynamoDB.DocumentClient();
const gatewayApi = new AWS.ApiGatewayManagementApi({ endpoint: WS_CONNECTION_URL });

const sendNotification = async (connectionId, action) => {
  const params = {
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify({ message: action }))
  };

  await gatewayApi.postToConnection(params).promise();
};

const notifyAll = async (action) => {
  const { Items } = await dynamodb.scan({ TableName: DYNAMODB_USERS_WS_CONNECTIONS_TABLE }).promise();

  await Promise.all(
    Items.map((u) => {
      const params = {
        ConnectionId: u.connectionId,
        Data: Buffer.from(JSON.stringify({ message: action }))
      };

      return gatewayApi.postToConnection(params).promise();
    })
  );
};

exports.handleConnect = async (event) => {
  console.log(`handleConnect event >>>>>>>`, event);
  const { connectionId, authorizer } = event.requestContext;
  const userId = JSON.parse(authorizer.principalId).userId;

  await dynamodb
    .put({
      TableName: DYNAMODB_USERS_WS_CONNECTIONS_TABLE,
      Item: {
        userId,
        connectionId
      }
    })
    .promise();

  return { statusCode: 200 };
};

exports.handleDisconnect = async (event) => {
  const { identity } = event.requestContext;
  const userId = getUserId(identity.userAgent);

  const result = await dynamodb
    .delete({
      TableName: DYNAMODB_USERS_WS_CONNECTIONS_TABLE,
      Key: { userId },
      ReturnValues: 'ALL_OLD'
    })
    .promise();

  return { statusCode: 200 };
};

exports.getConnections = async (event) => {
  console.log(`getConnection event >>>>>>>`, event);
  const { Count, Items } = await dynamodb.scan({ TableName: DYNAMODB_USERS_WS_CONNECTIONS_TABLE }).promise();

  const edgeUser = Items.find((u) => u.userId === 'Edge');
  const chromeUser = Items.find((u) => u.userId === 'Chrome');
  const firefoxUser = Items.find((u) => u.userId === 'Firefox');
  const safariUser = Items.find((u) => u.userId === 'Safari');

  chromeUser && (await sendNotification(chromeUser.connectionId, 'GET_CONNECTIONS_ACTION_FOR_CHROME'));
  edgeUser && (await sendNotification(edgeUser.connectionId, 'GET_CONNECTIONS_ACTION_FOR_EDGE'));
  firefoxUser && (await sendNotification(firefoxUser.connectionId, 'GET_CONNECTIONS_ACTION_FOR_FIREFOX'));
  safariUser && (await sendNotification(safariUser.connectionId, 'GET_CONNECTIONS_ACTION_FOR_SAFARI'));
  await notifyAll('IT_IS_NOTIFICATION_FOR_ALL_USERS');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      total: Count,
      items: Items
    })
  };
};

exports.wsAuthorizer = async (event) => {
  console.log(`wsAuth event >>>>>>>`, event);

  const { queryStringParameters, methodArn } = event;
  const userId = Buffer.from(queryStringParameters.access_token, 'base64').toString('ascii');

  if (!userId) {
    throw new Error('Unauthorized');
  }

  return {
    principalId: userId,
    policyDocument: {
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: methodArn
        }
      ]
    }
  };
};
