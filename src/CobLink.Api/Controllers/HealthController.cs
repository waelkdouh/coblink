using System;
using CobLink.Api.Infrastructure;
using CobLink.Data.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CobLink.Api.Controllers
{
    /// <summary>Anonymous liveness/readiness probe for load balancers, Docker and CI. Not part of the response envelope.</summary>
    [ApiController]
    [AllowAnonymous]
    [Route("health")]
    public class HealthController : ControllerBase
    {
        private readonly IDatabaseStatus _databaseStatus;
        private readonly IHostEnvironment _environment;
        private readonly ILogger<HealthController> _logger;

        public HealthController(IDatabaseStatus databaseStatus, IHostEnvironment environment, ILogger<HealthController> logger)
        {
            _databaseStatus = databaseStatus;
            _environment = environment;
            _logger = logger;
        }

        [HttpGet]
        public IActionResult Get()
        {
            string error;
            bool databaseUp = _databaseStatus.CanConnect(out error);
            if (!databaseUp)
            {
                // The reason stays in the log; an anonymous endpoint must not leak connection details.
                _logger.LogWarning("Health check: database is down. {Error}", error);
            }

            var body = new
            {
                status = databaseUp ? "Healthy" : "Unhealthy",
                database = databaseUp ? "Up" : "Down",
                version = AppVersion.Current,
                environment = _environment.EnvironmentName,
                time = DateTime.UtcNow
            };

            return StatusCode(databaseUp ? 200 : 503, body);
        }
    }
}
