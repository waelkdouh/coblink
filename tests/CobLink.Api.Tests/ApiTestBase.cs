using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using CobLink.TestSupport;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CobLink.Api.Tests
{
    /// <summary>A response that is kept as raw JSON so tests assert on the actual wire format.</summary>
    public class ApiResult
    {
        public HttpStatusCode Status { get; set; }
        public HttpResponseHeaders Headers { get; set; }
        public string Raw { get; set; }
        public JObject Json { get; set; }

        public bool Success
        {
            get { return (bool)Json["success"]; }
        }

        public string ErrorCode
        {
            get { return (string)Json["errorCode"]; }
        }

        public string Message
        {
            get { return (string)Json["message"]; }
        }

        public JToken Data
        {
            get { return Json["data"]; }
        }

        public JArray Errors
        {
            get { return (JArray)Json["errors"]; }
        }
    }

    /// <summary>One test server per test, so tests never see each other's data.</summary>
    public abstract class ApiTestBase : IDisposable
    {
        protected ApiTestBase()
            : this(new ApiFactory())
        {
        }

        protected ApiTestBase(ApiFactory factory)
        {
            Factory = factory;
            Http = factory.CreateClient();
        }

        protected ApiFactory Factory { get; private set; }

        protected HttpClient Http { get; private set; }

        protected TestWorld World
        {
            get { return Factory.World; }
        }

        protected Task<ApiResult> GetAsync(string url, string user = null)
        {
            var request = new HttpRequestMessage(HttpMethod.Get, url);
            return SendAsync(request, user);
        }

        protected Task<ApiResult> PostAsync(string url, object body, string user = null)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(
                    body as string ?? JsonConvert.SerializeObject(body),
                    Encoding.UTF8,
                    "application/json")
            };
            return SendAsync(request, user);
        }

        protected async Task<ApiResult> SendAsync(HttpRequestMessage request, string user)
        {
            if (user != null)
            {
                request.Headers.Add("X-CobLink-User", user);
            }

            HttpResponseMessage response = await Http.SendAsync(request);
            string raw = await response.Content.ReadAsStringAsync();
            JObject json = null;
            if (raw.TrimStart().StartsWith("{", StringComparison.Ordinal))
            {
                // Dates stay strings so tests see exactly what is on the wire.
                using (var reader = new JsonTextReader(new StringReader(raw)) { DateParseHandling = DateParseHandling.None })
                {
                    json = JObject.Load(reader);
                }
            }

            return new ApiResult { Status = response.StatusCode, Headers = response.Headers, Raw = raw, Json = json };
        }

        public void Dispose()
        {
            Http.Dispose();
            Factory.Dispose();
        }
    }

    public static class Personas
    {
        public const string Jamie = "CORP\\jdoe";
        public const string Alex = "CORP\\asmith";
        public const string Blake = "CORP\\bwilson";
        public const string Casey = "CORP\\admin";
    }
}
