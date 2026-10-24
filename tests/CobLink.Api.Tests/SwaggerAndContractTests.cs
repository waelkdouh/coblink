using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using Xunit;

namespace CobLink.Api.Tests
{
    /// <summary>The endpoint table of docs/api-reference.md, parsed so the document cannot drift from the code.</summary>
    internal static class DocumentedEndpoints
    {
        public static IList<string> Load()
        {
            string root = AppContext.BaseDirectory;
            while (root != null && !File.Exists(Path.Combine(root, "CobLink.sln")))
            {
                root = Path.GetDirectoryName(root);
            }

            Assert.True(root != null, "CobLink.sln was not found above " + AppContext.BaseDirectory);

            var endpoints = new List<string>();
            foreach (string line in File.ReadAllLines(Path.Combine(root, "docs", "api-reference.md")))
            {
                string[] cells = line.Split('|');
                if (cells.Length < 4)
                {
                    continue;
                }

                string method = cells[1].Trim();
                if (method != "GET" && method != "POST")
                {
                    continue;
                }

                string route = cells[2].Trim().Trim('`');
                int query = route.IndexOf('?');
                if (query >= 0)
                {
                    route = route.Substring(0, query);
                }

                endpoints.Add(method + " " + route);
            }

            return endpoints;
        }
    }

    public class SwaggerTests : ApiTestBase
    {
        [Fact]
        public async Task The_implemented_endpoints_are_exactly_the_documented_endpoints()
        {
            ApiResult swagger = await GetAsync("/swagger/v1/swagger.json");
            Assert.Equal(HttpStatusCode.OK, swagger.Status);

            List<string> implemented = new List<string>();
            foreach (JProperty path in ((JObject)swagger.Json["paths"]).Properties())
            {
                foreach (JProperty operation in ((JObject)path.Value).Properties())
                {
                    implemented.Add(operation.Name.ToUpperInvariant() + " " + path.Name);
                }
            }

            IList<string> documented = DocumentedEndpoints.Load();

            Assert.Equal(26, documented.Count);
            Assert.Equal(documented.OrderBy(e => e, StringComparer.Ordinal), implemented.OrderBy(e => e, StringComparer.Ordinal));
        }

        [Fact]
        public async Task The_persona_header_is_offered_as_an_api_key_in_development_mode()
        {
            ApiResult swagger = await GetAsync("/swagger/v1/swagger.json");

            JToken persona = swagger.Json["components"]["securitySchemes"]["Persona"];
            Assert.Equal("apiKey", (string)persona["type"]);
            Assert.Equal("header", (string)persona["in"]);
            Assert.Equal("X-CobLink-User", (string)persona["name"]);
        }

        [Fact]
        public async Task The_swagger_ui_page_is_served()
        {
            ApiResult page = await GetAsync("/swagger/index.html");

            Assert.Equal(HttpStatusCode.OK, page.Status);
            Assert.Contains("COBLink API", page.Raw);
        }
    }

    public class DocumentedEndpointSecurityTests : ApiTestBase
    {
        public DocumentedEndpointSecurityTests()
            : base(new ApiFactory(environment: "Production", authenticationMode: "Windows"))
        {
        }

        [Fact]
        public async Task Every_documented_api_endpoint_rejects_an_anonymous_caller()
        {
            IList<string> api = DocumentedEndpoints.Load().Where(e => e.Contains(" /api/")).ToList();
            Assert.Equal(25, api.Count);

            foreach (string endpoint in api)
            {
                string[] parts = endpoint.Split(' ');
                ApiResult result = parts[0] == "GET" ? await GetAsync(parts[1]) : await PostAsync(parts[1], new { });

                Assert.True(result.Status == HttpStatusCode.Unauthorized, endpoint + " returned " + result.Status);
            }
        }
    }
}
