use crate::blocks::block::{parse_pair, replace_variables_in_string, Block, BlockType, Env};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::header;
use hyper::{body::Buf, Body, Client, Method, Request};
use hyper_tls::HttpsConnector;
use js_sandbox::Script;
use pest::iterators::Pair;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::prelude::*;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub error: String,
}

#[derive(Clone)]
pub struct Curl {
    method: String,
    url: String,
    headers_code: String,
    body_code: String,
}

impl Curl {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut method: Option<String> = None;
        let mut url: Option<String> = None;
        let mut headers_code: Option<String> = None;
        let mut body_code: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "method" => method = Some(value),
                        "url" => url = Some(value),
                        "headers_code" => headers_code = Some(value),
                        "body_code" => body_code = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `curl` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!("`expected` is not yet supported in `curl` block"))?,
                _ => unreachable!(),
            }
        }

        if !method.is_some() {
            Err(anyhow!("Missing required `method` in `curl` block"))?;
        }
        if !url.is_some() {
            Err(anyhow!("Missing required `url` in `curl` block"))?;
        }
        if !headers_code.is_some() {
            Err(anyhow!("Missing required `headers_code` in `curl` block"))?;
        }
        if !body_code.is_some() {
            Err(anyhow!("Missing required `body_code` in `curl` block"))?;
        }

        Ok(Curl {
            method: method.unwrap(),
            url: url.unwrap(),
            headers_code: headers_code.unwrap(),
            body_code: body_code.unwrap(),
        })
    }
}

#[derive(Serialize, Deserialize)]
struct CurlResult {
    status: u16,
    body: Option<serde_json::Value>,
    error: Option<String>,
}

#[async_trait]
impl Block for Curl {
    fn block_type(&self) -> BlockType {
        BlockType::Curl
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("curl".as_bytes());
        hasher.update(self.method.as_bytes());
        hasher.update(self.url.as_bytes());
        hasher.update(self.headers_code.as_bytes());
        hasher.update(self.body_code.as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, _name: &str, env: &Env) -> Result<Value> {
        let url = replace_variables_in_string(&self.url, "url", env)?;

        let method = match self.method.as_str() {
            "GET" => Method::GET,
            "POST" => Method::POST,
            "PUT" => Method::PUT,
            "PATCH" => Method::PATCH,
            _ => Err(anyhow!(
                "Invalid method {}, supported methods are GET, POST, PUT.",
                self.method
            ))?,
        };

        let e = env.clone();
        let headers_code = self.headers_code.clone();
        let headers_value: Value = match tokio::task::spawn_blocking(move || {
            let mut script = Script::from_string(headers_code.as_str())?
                .with_timeout(std::time::Duration::from_secs(10));
            script.call("_fun", (&e,))
        })
        .await?
        {
            Ok(v) => v,
            Err(e) => Err(anyhow!("Error in headers code: {}", e))?,
        };

        let e = env.clone();
        let body_code = self.body_code.clone();
        let body_value: Value = match tokio::task::spawn_blocking(move || {
            let mut script = Script::from_string(body_code.as_str())?
                .with_timeout(std::time::Duration::from_secs(10));
            script.call("_fun", (&e,))
        })
        .await?
        {
            Ok(v) => v,
            Err(e) => Err(anyhow!("Error in body code: {}", e))?,
        };

        // TODO(spolu): parse URL, check https, encode query, resolve host, ban internal IPs

        let mut req = Request::builder().method(method).uri(url.as_str());

        let headers = req.headers_mut().unwrap();
        match headers_value {
            Value::Object(h) => {
                for (key, value) in h {
                    match value {
                        Value::String(value) => {
                            headers.insert(
                                header::HeaderName::from_bytes(key.as_bytes())?,
                                header::HeaderValue::from_bytes(value.as_bytes())?,
                            );
                        }
                        _ => Err(anyhow!("Header value for header {} must be a string", key))?,
                    }
                }
            }
            _ => Err(anyhow!(
                "Returned headers must be an object with string values.",
            ))?,
        };

        let req = match body_value {
            Value::String(body) => req.body(Body::from(body))?,
            Value::Null => req.body(Body::empty())?,
            _ => Err(anyhow!("Returned body must be either a string or null."))?,
        };

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let res = cli.request(req).await?;

        let status = res.status();

        let body = hyper::body::aggregate(res).await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;

        let response_body = String::from_utf8_lossy(&b).into_owned();

        let response_body = match serde_json::from_str::<serde_json::Value>(&response_body) {
            Ok(body) => body,
            Err(_) => Value::String(response_body),
        };

        Ok(json!({
            "status": status.as_u16(),
            "body": response_body,
        }))
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
